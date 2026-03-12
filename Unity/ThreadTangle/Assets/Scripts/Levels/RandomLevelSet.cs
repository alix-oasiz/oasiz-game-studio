using UnityEngine;

[CreateAssetMenu(menuName = "ThreadTangle/Random Level Set", fileName = "RandomLevelSet")]
public class RandomLevelSet : ScriptableObject
{
    public DifficultyConfig[] levels;
}
