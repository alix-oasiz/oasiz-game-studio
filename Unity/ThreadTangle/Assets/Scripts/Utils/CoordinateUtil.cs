using UnityEngine;
using UnityEngine.UI;

public static class CoordinateUtil
{
    // Overlay canvases
    public static bool TryScreenToCell(GridManager grid, Vector2 screenPos, out Cell cell)
    {
        return TryScreenToCell(grid, screenPos, null, out cell);
    }

    // Camera-aware overload for Screen Space - Camera / World
    public static bool TryScreenToCell(GridManager grid, Vector2 screenPos, Camera cam, out Cell cell)
    {
        cell = null;
        if (grid == null || grid.gridRoot == null || grid.grid == null) return false;

        // Screen → local (use correct camera for Camera/World canvases; null for Overlay)
        if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(grid.gridRoot, screenPos, cam, out var local))
            return false;

        var rt      = grid.gridRoot;           // RectTransform hosting the grid
        var rect    = rt.rect;                 // container size (local space)
        var glg     = grid.grid;               // GridLayoutGroup
        var size    = glg.cellSize;
        var spacing = glg.spacing;
        var pad     = glg.padding;
        int cols    = grid.width;
        int rows    = grid.height;
        if (cols <= 0 || rows <= 0) return false;

        // Effective content (grid) size in pixels
        float contentW = pad.left + pad.right + cols * size.x + (cols - 1) * spacing.x;
        float contentH = pad.top  + pad.bottom + rows * size.y + (rows - 1) * spacing.y;

        // Alignment offsets (handles Upper/Middle/Lower × Left/Center/Right)
        GetAlignmentFactors(glg.childAlignment, out float ax, out float ay); // 0..1

        // Consider arbitrary pivot of the RectTransform (not just center)
        Vector2 pivot = rt.pivot; // (0,0)=bottom-left, (0.5,0.5)=center, (1,1)=top-right

        // Remaining space inside container rect (can be 0 or positive)
        float leftoverX = Mathf.Max(0f, rect.width  - contentW);
        float leftoverY = Mathf.Max(0f, rect.height - contentH);

        // Compute top-left origin of the grid content in local space
        // X: start from rect's left edge ( -rect.width * pivot.x ), then add alignment offset and left padding
        float topLeftX = -rect.width  * pivot.x + leftoverX * ax + pad.left;
        // Y: start from rect's top edge (  rect.height * (1 - pivot.y) ), then subtract alignment offset and top padding
        float topLeftY =  rect.height * (1f - pivot.y) - leftoverY * ay - pad.top;

        // Distances from content top-left (Y inverted because UI local Y grows up)
        float dx = local.x - topLeftX;    // from left
        float dy = topLeftY - local.y;    // from top

        // Out of content bounds early exits
        if (dx < 0f || dy < 0f) return false; // left/top
        if (dx > contentW - pad.right || dy > contentH - pad.bottom) return false; // right/bottom

        float stepX = size.x + spacing.x;
        float stepY = size.y + spacing.y;

        int cx = Mathf.FloorToInt(dx / stepX);
        int cy = Mathf.FloorToInt(dy / stepY);

        // Reject pointers that fall into spacing gaps between cells
        float cellLocalX = dx - cx * stepX;
        float cellLocalY = dy - cy * stepY;
        if (cellLocalX < 0f || cellLocalY < 0f) return false;
        if (cellLocalX > size.x || cellLocalY > size.y) return false;

        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;

        cell = grid.cells[cx, cy];
        return cell != null;
    }
    // Map TextAnchor to alignment factors (0..1) for X (left→right) and Y (top→bottom)
    static void GetAlignmentFactors(TextAnchor anchor, out float ax, out float ay)
    {
        switch (anchor)
        {
            default:
            case TextAnchor.UpperLeft:    ax = 0f;   ay = 0f;   break;
            case TextAnchor.UpperCenter:  ax = 0.5f; ay = 0f;   break;
            case TextAnchor.UpperRight:   ax = 1f;   ay = 0f;   break;
            case TextAnchor.MiddleLeft:   ax = 0f;   ay = 0.5f; break;
            case TextAnchor.MiddleCenter: ax = 0.5f; ay = 0.5f; break;
            case TextAnchor.MiddleRight:  ax = 1f;   ay = 0.5f; break;
            case TextAnchor.LowerLeft:    ax = 0f;   ay = 1f;   break;
            case TextAnchor.LowerCenter:  ax = 0.5f; ay = 1f;   break;
            case TextAnchor.LowerRight:   ax = 1f;   ay = 1f;   break;
        }
    }
}
