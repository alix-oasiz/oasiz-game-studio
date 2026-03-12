using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class UndoController : MonoBehaviour
{
    [Header("Refs")]
    public Button undoButton;
    public Text undoCountText;// Inspector: UI butonunu ata
    public PathDrawer pathDrawer;          // sahnedeki PathDrawer
    public StrokeLink strokeLink;          // kalıcı çizgileri çizen StrokeLink (aynı olan)

    [Header("Rules")]
    public bool oneShot = true;            // sadece 1 hak
    public bool disableOnStart = true;
    public int undoCountPerLevel = 1;

    // durum
    bool used = false;
    int lastPairId = -1;
    List<Cell> lastPath = null;            // spool..spool
    bool hasSnapshot = false;
    private int _currentUndoCount = 0;

    void Awake()
    {
        PathDrawer.OnLevelCompleteFunctions += ReChargeUndo;
        if (undoButton)
        {
            undoButton.onClick.AddListener(OnUndoClick);
            if (disableOnStart) undoButton.interactable = false;
        }
        PathDrawer.OnLevelCompleteFunctions += DisableUndo;   
        // UndoController.cs -> Awake()
        Debug.Log("[UndoController] Using StrokeLink instance: " + (strokeLink ? strokeLink.gameObject.name : "NULL"));
    }

    private void Start()
    {
        ReChargeUndo();
    }

    private void ReChargeUndo()
    {
        if(undoButton) undoButton.interactable = true;
        _currentUndoCount = undoCountPerLevel;
        RefreshText();
    }

    private void RefreshText()
    {
        undoCountText.text = _currentUndoCount.ToString();
    }

    void DisableUndo()
    {
        if(undoButton) undoButton.interactable = false;
    }

    void OnEnable()
    {
        PathDrawer.OnPairCommitted += OnPairCommitted;
    }
    void OnDisable()
    {
        PathDrawer.OnPairCommitted -= OnPairCommitted;
    }

    void OnPairCommitted(int pairId, List<Cell> path)
    {
        // son bağlanan çift olarak tut
        lastPairId = pairId;
        lastPath   = (path != null) ? new List<Cell>(path) : null;
        hasSnapshot = lastPath != null && lastPath.Count >= 2;

        // ilk hamle yapıldıktan sonra buton açılsın
        if (undoButton && _currentUndoCount > 0) undoButton.interactable = true;
    }

    void OnUndoClick()
    {
        if (!hasSnapshot || lastPairId < 0 || pathDrawer == null) return;
        if(_currentUndoCount <= 0) return;
        _currentUndoCount--;
        RefreshText();
        // 1) görsel çizgileri (bar/knot grubu) sil
        strokeLink.DestroyGroupForPair(lastPairId);

        // 2) oyundaki taşları temizle + spool'ları resetle
        pathDrawer.UnlockAndClearPair(lastPairId);

        // 3) tek hak ise disable
        used = true;
        if (undoButton && oneShot) undoButton.interactable = false;

        // snapshot'ı sıfırla
        lastPairId = -1;
        lastPath = null;
        hasSnapshot = false;
        
        if(GetComponent<FightArena>())FightArena.NotifyUndo();

        Debug.Log("[Undo] last committed pair reverted.");
    }
}