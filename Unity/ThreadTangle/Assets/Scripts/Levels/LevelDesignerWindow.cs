#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

public class LevelDesignerWindow : EditorWindow
{
    LevelSet levelSet;
    int sel = 0;

    Vector2 scroll;
    GUIStyle cellFieldStyle;
    GUIStyle headerStyle;

    const int BLOCK = 3;

    [MenuItem("ThreadTangle/Level Designer %#L")]
    public static void Open()
    {
        var wnd = GetWindow<LevelDesignerWindow>("Level Designer");
        wnd.minSize = new Vector2(640, 480);
        wnd.Show();
    }

    void OnEnable()
    {
        cellFieldStyle = new GUIStyle(EditorStyles.textField)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 12,
            fixedWidth = 34,
            fixedHeight = 22
        };

        headerStyle = new GUIStyle(EditorStyles.boldLabel) { fontSize = 13 };
    }

    void OnGUI()
    {
        EditorGUILayout.Space(4);

        EditorGUILayout.BeginHorizontal();
        levelSet = (LevelSet)EditorGUILayout.ObjectField("Level Set", levelSet, typeof(LevelSet), false);
        if (GUILayout.Button("New", GUILayout.Width(60)))
        {
            var path = EditorUtility.SaveFilePanelInProject("Create LevelSet", "LevelSet", "asset", "Save LevelSet asset");
            if (!string.IsNullOrEmpty(path))
            {
                var asset = ScriptableObject.CreateInstance<LevelSet>();
                AssetDatabase.CreateAsset(asset, path);
                AssetDatabase.SaveAssets();
                levelSet = asset;
            }
        }
        EditorGUILayout.EndHorizontal();

        if (!levelSet)
        {
            EditorGUILayout.HelpBox("Bir LevelSet asset seç veya oluştur.", MessageType.Info);
            return;
        }

        EditorGUILayout.Space(6);

        // Level listesi
        EditorGUILayout.BeginHorizontal();
        EditorGUILayout.LabelField("Levels", headerStyle);
        GUILayout.FlexibleSpace();
        if (GUILayout.Button("+ Add Level", GUILayout.Width(110)))
        {
            Undo.RecordObject(levelSet, "Add Level");
            var lvl = new LevelDefinition();
            lvl.EnsureSize(6, 6, 0);
            levelSet.levels.Add(lvl);
            sel = levelSet.levels.Count - 1;
            EditorUtility.SetDirty(levelSet);
        }
        if (GUILayout.Button("– Remove", GUILayout.Width(90)))
        {
            if (levelSet.levels.Count > 0)
            {
                Undo.RecordObject(levelSet, "Remove Level");
                levelSet.levels.RemoveAt(Mathf.Clamp(sel, 0, levelSet.levels.Count - 1));
                sel = Mathf.Clamp(sel - 1, 0, levelSet.levels.Count - 1);
                EditorUtility.SetDirty(levelSet);
            }
        }
        EditorGUILayout.EndHorizontal();

        // Seçim
        if (levelSet.levels.Count == 0)
        {
            EditorGUILayout.HelpBox("Hiç level yok. + Add Level ile ekle.", MessageType.Warning);
            return;
        }
        sel = Mathf.Clamp(sel, 0, levelSet.levels.Count - 1);

        // Seçimi toolbar gibi göster
        EditorGUILayout.BeginHorizontal();
        for (int i = 0; i < levelSet.levels.Count; i++)
        {
            var style = (i == sel) ? EditorStyles.miniButtonMid : EditorStyles.miniButton;
            if (GUILayout.Toggle(i == sel, $"L{i}", style, GUILayout.Width(40))) sel = i;
        }
        EditorGUILayout.EndHorizontal();

        var def = levelSet.levels[sel];

        EditorGUILayout.Space(6);

        // Üst bilgiler
        EditorGUI.BeginChangeCheck();
        def.levelName = EditorGUILayout.TextField("Level Name", def.levelName);
        def.timeSec   = EditorGUILayout.IntField("Time (sec)", def.timeSec);
        def.fillAll   = EditorGUILayout.Toggle("Fill All", def.fillAll);

        EditorGUILayout.BeginHorizontal();
        int newW = EditorGUILayout.IntField("Width", def.width, GUILayout.MaxWidth(220));
        int newH = EditorGUILayout.IntField("Height", def.height, GUILayout.MaxWidth(220));
        if (GUILayout.Button("Resize & Fill 0", GUILayout.Width(140)))
        {
            Undo.RecordObject(levelSet, "Resize Level");
            def.EnsureSize(newW, newH, 0);
            EditorUtility.SetDirty(levelSet);
        }
        EditorGUILayout.EndHorizontal();

        // Aktif level index (runtime)
        levelSet.defaultLevelIndex = EditorGUILayout.IntSlider("Default Level Index", levelSet.defaultLevelIndex, 0, Mathf.Max(0, levelSet.levels.Count - 1));

        if (EditorGUI.EndChangeCheck())
            EditorUtility.SetDirty(levelSet);

        EditorGUILayout.Space(8);
        EditorGUILayout.LabelField("Grid (0=empty, 3=block, diğer sayılar=pair kodu)", headerStyle);

        // GRID alanı
        if (def.codes == null || def.codes.Length != def.width * def.height)
        {
            def.EnsureSize(def.width, def.height, 0);
            EditorUtility.SetDirty(levelSet);
        }

        scroll = EditorGUILayout.BeginScrollView(scroll, GUILayout.Height(Mathf.Clamp(def.height * 26 + 12, 120, 600)));
        // y üstten alta (tasarım gözüyle): JSON’da invertY gibi dert yok, gözünün gördüğünü yaz
        for (int y = 0; y < def.height; y++)
        {
            EditorGUILayout.BeginHorizontal();
            GUILayout.Space(12);
            for (int x = 0; x < def.width; x++)
            {
                int idx = y * def.width + x;
                var str = def.codes[idx].ToString();

                // renkli arkaplan: 0 gri, 3 koyu, diğerleri açık renkte
                var bg = GUI.backgroundColor;
                if (def.codes[idx] == 0) GUI.backgroundColor = new Color(0.9f,0.9f,0.9f,1f);
                else if (def.codes[idx] == BLOCK) GUI.backgroundColor = new Color(0.2f,0.2f,0.2f,1f);
                else GUI.backgroundColor = new Color(0.85f,0.95f,1f,1f);

                var newStr = EditorGUILayout.TextField(str, cellFieldStyle);
                GUI.backgroundColor = bg;

                if (newStr != str)
                {
                    if (int.TryParse(newStr, out int v))
                    {
                        Undo.RecordObject(levelSet, "Edit Cell");
                        def.codes[idx] = v;
                        EditorUtility.SetDirty(levelSet);
                    }
                }
                GUILayout.Space(4);
            }
            EditorGUILayout.EndHorizontal();
            GUILayout.Space(4);
        }
        EditorGUILayout.EndScrollView();

        EditorGUILayout.Space(8);

        // Hızlı butonlar
        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Fill All To 0", GUILayout.Width(140)))
        {
            Undo.RecordObject(levelSet, "Fill 0");
            for (int i = 0; i < def.codes.Length; i++) def.codes[i] = 0;
            EditorUtility.SetDirty(levelSet);
        }
        if (GUILayout.Button("Validate Pairs", GUILayout.Width(140)))
        {
            if (def.ValidatePairs(out var msg))
                EditorUtility.DisplayDialog("Validate", "OK – her renk kodu 2 adet.", "Tamam");
            else
                EditorUtility.DisplayDialog("Validate", msg, "Tamam");
        }
        GUILayout.FlexibleSpace();
        if (GUILayout.Button("Build In Scene Now", GUILayout.Width(180)))
        {
            BuildInSceneNow(def);
        }
        EditorGUILayout.EndHorizontal();

        EditorGUILayout.Space(8);
        EditorGUILayout.HelpBox("Kısayol: 0=empty, 3=block. 0 ve 3 dışındaki her sayı bir renktir ve sahnede 'spool' olur (tam 2 adet).", MessageType.Info);
    }

    void BuildInSceneNow(LevelDefinition def)
    {
        var loader = FindFirstObjectByType<LevelRuntimeLoader>();
        if (!loader)
        {
            EditorUtility.DisplayDialog("Loader Yok", "Sahnede LevelRuntimeLoader bulunamadı. Bir GameObject'e ekleyip GridManager ve SpritePalette referanslarını doldur.", "Tamam");
            return;
        }

        // editor play-dışı uygula
        loader.Apply(def);
        EditorGUIUtility.PingObject(loader.gameObject);
        Debug.Log("[LevelDesigner] Scene updated with current level.");
    }
}
#endif