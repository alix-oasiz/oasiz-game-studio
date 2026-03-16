using System;

namespace Oasiz
{
  [Serializable]
  public enum HapticType
  {
    Light,
    Medium,
    Heavy,
    Success,
    Error,
  }

  [Serializable]
  public struct ScoreAnchor
  {
    public int raw;
    public int normalized;

    public ScoreAnchor(int raw, int normalized)
    {
      this.raw = raw;
      this.normalized = normalized;
    }
  }

  [Serializable]
  public struct ScoreConfig
  {
    public ScoreAnchor[] anchors;

    public ScoreConfig(ScoreAnchor a1, ScoreAnchor a2, ScoreAnchor a3, ScoreAnchor a4)
    {
      anchors = new[] { a1, a2, a3, a4 };
    }
  }
}
