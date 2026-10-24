using System;
using System.Collections.Generic;
using System.Reflection;
using System.Reflection.Emit;
using System.Text.RegularExpressions;
using Godot;
using HarmonyLib;
using MegaCrit.Sts2.Core.Entities.Players;
using MegaCrit.Sts2.Core.Modding;
using MegaCrit.Sts2.Core.Rooms;
using MegaCrit.Sts2.Core.Runs;
using MegaCrit.Sts2.Core.Localization;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Nodes.Screens.Overlays;
using System.Threading.Tasks;

namespace SpireAdvisorDeck;

// Adds data to the existing bridge response. No game actions, commands or save writes.
[ModInitializer(nameof(Initialize))]
public static class DeckExport
{
    private static readonly object Gate = new();
    private static bool _patched;
    private static bool _patching;
    private static bool _failed;
    private static SceneTree? _tree;
    private static int _frames;
    private static MethodInfo? _cardInfo;
    private static MethodInfo? _originalShop;
    private static MethodInfo? _hoverTips;
    private static bool _shopPatched;
    private static bool _shopAutoOpenBlocked;
    private static bool _eventContextPatched;
    [ThreadStatic] private static bool _buildingPreview;

    public static void Initialize()
    {
        // Wait until normal frames begin, after all mod assemblies initialize.
        // Patching inside AssemblyLoad can re-enter Harmony's own initialization.
        if (Engine.GetMainLoop() is SceneTree tree)
        {
            _tree = tree;
            tree.ProcessFrame += OnFrame;
        }
        else TryPatch();
    }

    private static void OnFrame()
    {
        TryPatch();
        if (_patched || _failed || ++_frames >= 300)
        {
            if (_tree != null) _tree.ProcessFrame -= OnFrame;
            _tree = null;
            if (!_patched && !_failed) GD.PrintErr("[SpireAdvisorDeck] STS2_MCP was not found. Enable both mods and restart.");
        }
    }

    private static void TryPatch()
    {
        lock (Gate)
        {
            if (_patched || _patching || _failed) return;
            _patching = true;
            try
            {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                var bridge = assembly.GetType("STS2_MCP.McpMod", false);
                if (bridge == null) continue;
                var flags = BindingFlags.Static | BindingFlags.NonPublic;
                var target = bridge.GetMethod("BuildPlayerState", flags);
                var cardInfo = bridge.GetMethod("BuildCardInfo", flags);
                if (target == null || cardInfo == null || cardInfo.GetParameters().Length != 2)
                {
                    GD.PrintErr("[SpireAdvisorDeck] Unsupported STS2_MCP bridge. Deck export was not installed.");
                    _failed = true;
                    return;
                }
                try
                {
                    _cardInfo = cardInfo;
                    var harmony = new Harmony("local.spireadvisor.deckexport");
                    harmony.Patch(cardInfo,
                        postfix: new HarmonyMethod(typeof(DeckExport).GetMethod(nameof(AfterCard), flags)!));
                    harmony.Patch(target,
                        postfix: new HarmonyMethod(typeof(DeckExport).GetMethod(nameof(AfterPlayer), flags)!));
                    _patched = true;
                    TryPatchShop(bridge, harmony);
                    TryPatchEventContext(bridge, harmony);
                    GD.Print("[SpireAdvisorDeck] Full deck and upgrade previews enabled (v0.6.0).");
                }
                catch (Exception ex)
                {
                    _cardInfo = null;
                    _failed = true;
                    GD.PrintErr("[SpireAdvisorDeck] Could not patch bridge: " + ex.GetType().Name);
                }
                return;
            }
            }
            finally { _patching = false; }
        }
    }

    private static void AfterPlayer(Player player, Dictionary<string, object?> __result)
    {
        try
        {
            if (_cardInfo == null) throw new InvalidOperationException("Card formatter is unavailable");
            // Use the same live card formatter as rewards, preserving resolved text,
            // cost, type, rarity, upgrade flags, and keyword descriptions.
            var pileParameter = _cardInfo.GetParameters()[1].ParameterType;
            var none = Enum.Parse(pileParameter, "None");
            var deck = new List<Dictionary<string, object?>>();
            foreach (var card in player.Deck.Cards)
            {
                if (_cardInfo.Invoke(null, new object?[] { card, none }) is not Dictionary<string, object?> info)
                    throw new InvalidOperationException("Unsupported card formatter result");
                info["index"] = deck.Count;
                if (!info.ContainsKey("upgrade_preview_available")) AddUpgradePreview(card, info);
                deck.Add(info);
            }
            __result["deck"] = deck;
            __result["deck_available"] = true;
            __result["deck_source"] = "SpireAdvisorDeck/0.6.0";
            __result["shop_reader_compatible"] = _shopPatched;
            __result["shop_auto_open_blocked"] = _shopAutoOpenBlocked;
            __result["event_context_compatible"] = _eventContextPatched;
            __result.Remove("deck_error");
        }
        catch (Exception ex)
        {
            __result.Remove("deck");
            __result["deck_available"] = false;
            __result["deck_error"] = "Full deck export failed: " + ex.GetType().Name;
        }
    }

    private static void AfterCard(CardModel card, Dictionary<string, object?> __result)
    {
        if (!_buildingPreview) AddUpgradePreview(card, __result);
    }

    private static void AddUpgradePreview(CardModel card, Dictionary<string, object?> info)
    {
        bool wasBuilding = _buildingPreview;
        _buildingPreview = true;
        try
        {
            info["can_upgrade"] = card.IsUpgradable;
            info["upgrade_level"] = card.CurrentUpgradeLevel;
            info["max_upgrade_level"] = card.MaxUpgradeLevel;
            info["upgrade_preview_available"] = false;
            if (!card.IsUpgradable) return;
            // MutableClone deep-copies dynamic variables, costs and enchantments,
            // and AfterCloned clears listeners. Never use CardCmd.Upgrade: it records
            // upgrades in the run and triggers effects. Only mutate this detached copy.
            var preview = (CardModel)card.MutableClone();
            if (ReferenceEquals(preview, card)) throw new InvalidOperationException("Preview must be detached");
            preview.UpgradeInternal();
            preview.FinalizeUpgradeInternal();
            var none = Enum.Parse(_cardInfo!.GetParameters()[1].ParameterType, "None");
            var after = (Dictionary<string, object?>)_cardInfo.Invoke(null, new object?[] { preview, none })!;
            if (!after.TryGetValue("description", out var description) || description is not string text || string.IsNullOrWhiteSpace(text))
                throw new InvalidOperationException("Upgrade description unavailable");
            info["upgrade_preview"] = after;
            info["upgrade_description"] = text;
            info["upgrade_preview_available"] = true;
            info["upgrade_preview_source"] = "game_model_clone";
        }
        catch (Exception ex)
        {
            info["upgrade_preview_available"] = false;
            info.Remove("upgrade_preview");
            info.Remove("upgrade_description");
            info["upgrade_preview_error"] = "Upgrade preview failed: " + ex.GetType().Name;
        }
        finally { _buildingPreview = wasBuilding; }
    }

    private static void TryPatchShop(Type bridge, Harmony harmony)
    {
        try
        {
            var flags = BindingFlags.Static | BindingFlags.NonPublic;
            var gameState = bridge.GetMethod("BuildGameState", flags);
            _originalShop = bridge.GetMethod("BuildShopState", flags);
            _hoverTips = bridge.GetMethod("BuildHoverTips", flags);
            if (gameState == null || _originalShop == null) throw new MissingMethodException("Bridge shop reader not found");
            // Redirect the caller. Never ask Harmony/JIT to parse the old reader,
            // whose IL references the removed MerchantRoom.Inventory getter.
            harmony.Patch(gameState, transpiler: new HarmonyMethod(typeof(DeckExport).GetMethod(nameof(ReplaceShopReader), flags)!));
            _shopPatched = true;
            GD.Print("[SpireAdvisorDeck] Shop reader compatibility enabled.");
        }
        catch (Exception ex)
        {
            GD.PrintErr("[SpireAdvisorDeck] Shop compatibility failed: " + ex.GetType().Name);
        }
    }

    private static void TryPatchEventContext(Type bridge, Harmony harmony)
    {
        try
        {
            var flags = BindingFlags.Static | BindingFlags.NonPublic;
            var target = bridge.GetMethod("BuildGameState", flags) ?? throw new MissingMethodException();
            harmony.Patch(target, postfix: new HarmonyMethod(typeof(DeckExport).GetMethod(nameof(AfterGameState), flags)!));
            _eventContextPatched = true;
        }
        catch (Exception ex) { GD.PrintErr("[SpireAdvisorDeck] Event context unavailable: " + ex.GetType().Name); }
    }

    private static void AfterGameState(Dictionary<string, object?> __result)
    {
        if (!__result.TryGetValue("state_type", out var type) || (type as string != "map" && type as string != "event" && type as string != "card_reward")) return;
        try
        {
            var run = RunManager.Instance.DebugOnlyGetState();
            if (run == null) throw new InvalidOperationException("No run");
            var context = new Dictionary<string, object?> { ["available"] = true, ["is_event_room"] = false, ["source"] = "SpireAdvisorDeck/0.6.0" };
            context["reward_state_available"] = true;
            context["card_reward_pending"] = false;
            var overlay = NOverlayStack.Instance?.Peek();
            if (overlay?.GetType().FullName == "MegaCrit.Sts2.Core.Nodes.Screens.CardSelection.NCardRewardSelectionScreen")
            {
                // Observe the existing completion task. Never invoke OptionSelected(),
                // which would replace the game's active task and alter selection.
                var source = overlay.GetType().GetField("_completionSource", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(overlay);
                var task = source?.GetType().GetProperty("Task")?.GetValue(source) as Task;
                context["reward_state_available"] = task != null;
                context["card_reward_pending"] = task == null ? null : !task.IsCompleted;
            }
            if (run.CurrentRoom is EventRoom room)
            {
                // The mutable local model owns actual progress; the canonical event
                // does not represent the current player's completed choices.
                var current = room.LocalMutableEvent;
                context["is_event_room"] = true;
                context["is_finished"] = current != null && current.IsFinished;
                if (current == null) context["available"] = false;
            }
            __result["room_context"] = context;
        }
        catch (Exception ex) { __result["room_context"] = new Dictionary<string, object?> { ["available"] = false, ["error"] = "Event context unavailable: " + ex.GetType().Name }; }
    }

    private static IEnumerable<CodeInstruction> ReplaceShopReader(IEnumerable<CodeInstruction> instructions)
    {
        var replacement = typeof(DeckExport).GetMethod(nameof(BuildShopCompatible), BindingFlags.Static | BindingFlags.NonPublic)!;
        int replaced = 0;
        int blocked = 0;
        foreach (var instruction in instructions)
        {
            // The bridge's GET reader opens the merchant UI on every poll.
            // Consume the receiver with a no-op; leave actual player clicks alone.
            if (instruction.operand is MethodInfo action && action.Name == "OpenInventory" &&
                action.DeclaringType?.FullName == "MegaCrit.Sts2.Core.Nodes.Rooms.NMerchantRoom" &&
                !action.IsStatic && action.ReturnType == typeof(void) && action.GetParameters().Length == 0)
            {
                instruction.opcode = OpCodes.Call;
                instruction.operand = typeof(DeckExport).GetMethod(nameof(SkipShopAutoOpen), BindingFlags.Static | BindingFlags.NonPublic)!;
                blocked++;
            }
            if (instruction.operand is MethodInfo method && method.Equals(_originalShop))
            {
                instruction.opcode = OpCodes.Call;
                instruction.operand = replacement;
                replaced++;
            }
            yield return instruction;
        }
        if (replaced == 0) throw new InvalidOperationException("No shop call found in bridge");
        _shopAutoOpenBlocked = blocked > 0;
    }

    private static void SkipShopAutoOpen(object room) { }

    private static string? Text(Func<LocString> get)
    {
        try { return Regex.Replace(get().GetFormattedText(), @"\[[^\]]+\]", ""); }
        catch { return null; }
    }

    private static object Tips(object tips)
    {
        try { return _hoverTips?.Invoke(null, new[] { tips }) ?? new object[0]; }
        catch { return new object[0]; }
    }

    private static Dictionary<string, object?> BuildShopCompatible(MerchantRoom room, RunState runState)
    {
        var items = new List<Dictionary<string, object?>>();
        try
        {
            var inventory = room.GetLocalInventory();
            if (inventory == null) return new() { ["items"] = items, ["available"] = false, ["error"] = "Shop inventory is not ready yet" };
            foreach (var entry in inventory.CardEntries)
            {
                var item = new Dictionary<string, object?> {
                    ["index"] = items.Count, ["category"] = "card", ["price"] = entry.Cost,
                    ["is_stocked"] = entry.IsStocked, ["can_afford"] = entry.EnoughGold, ["on_sale"] = entry.IsOnSale
                };
                if (entry.CreationResult?.Card is { } card)
                {
                    if (_cardInfo == null) throw new InvalidOperationException("Card formatter is unavailable");
                    var none = Enum.Parse(_cardInfo.GetParameters()[1].ParameterType, "None");
                    var info = (Dictionary<string, object?>)_cardInfo.Invoke(null, new object?[] { card, none })!;
                    foreach (var key in new[] { "id", "name", "type", "cost", "star_cost", "rarity", "description" })
                        if (info.TryGetValue(key, out var value)) item["card_" + key] = value;
                    if (info.TryGetValue("keywords", out var keywords)) item["keywords"] = keywords;
                }
                items.Add(item);
            }
            foreach (var entry in inventory.RelicEntries)
            {
                var item = new Dictionary<string, object?> {
                    ["index"] = items.Count, ["category"] = "relic", ["price"] = entry.Cost,
                    ["is_stocked"] = entry.IsStocked, ["can_afford"] = entry.EnoughGold
                };
                if (entry.Model is { } relic)
                {
                    item["relic_id"] = relic.Id.Entry;
                    item["relic_name"] = Text(() => relic.Title);
                    item["relic_description"] = Text(() => relic.DynamicDescription);
                    item["keywords"] = Tips(relic.HoverTipsExcludingRelic);
                }
                items.Add(item);
            }
            foreach (var entry in inventory.PotionEntries)
            {
                var item = new Dictionary<string, object?> {
                    ["index"] = items.Count, ["category"] = "potion", ["price"] = entry.Cost,
                    ["is_stocked"] = entry.IsStocked, ["can_afford"] = entry.EnoughGold
                };
                if (entry.Model is { } potion)
                {
                    item["potion_id"] = potion.Id.Entry;
                    item["potion_name"] = Text(() => potion.Title);
                    item["potion_description"] = Text(() => potion.DynamicDescription);
                    item["keywords"] = Tips(potion.ExtraHoverTips);
                }
                items.Add(item);
            }
            if (inventory.CardRemovalEntry is { } removal)
                items.Add(new() { ["index"] = items.Count, ["category"] = "card_removal", ["price"] = removal.Cost, ["is_stocked"] = removal.IsStocked, ["can_afford"] = removal.EnoughGold });
            return new() { ["items"] = items, ["available"] = true, ["source"] = "SpireAdvisorDeck/0.6.0" };
        }
        catch (Exception ex)
        {
            // A partial inventory is not a valid empty shop. Never recommend from it.
            return new() { ["items"] = new List<Dictionary<string, object?>>(), ["available"] = false, ["error"] = "Shop reader failed: " + ex.GetType().Name };
        }
    }
}
