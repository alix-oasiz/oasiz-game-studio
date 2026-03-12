using UnityEngine;

public class AudioManager : MonoBehaviour
{
    [System.Serializable]
    public struct Sound
    {
        public string name;
        public AudioClip clip;
        [Range(0f, 1f)] public float volume;
        [Range(0.1f, 3f)] public float pitch;
        public bool loop;
    }

    [Header("Ses Listesi")]
    public Sound[] sounds;

    private AudioSource _source;

    void Awake()
    {
        _source = gameObject.AddComponent<AudioSource>();
        _source.playOnAwake = false;
    }

    /// <summary>
    /// İsme göre sesi çalar.
    /// </summary>
    public void Play(string soundName)
    {
        foreach (var s in sounds)
        {
            if (s.name == soundName)
            {
                _source.clip = s.clip;
                _source.volume = s.volume;
                _source.pitch = s.pitch;
                _source.loop = s.loop;
                _source.Play();
                Debug.Log($"[AudioManager] '{soundName}' sesi çalınıyor.");
                return;
            }
        }

        Debug.LogWarning($"[AudioManager] '{soundName}' isminde bir ses bulunamadı!");
    }

    /// <summary>
    /// O an çalan sesi durdurur.
    /// </summary>
    public void Stop()
    {
        if (_source.isPlaying)
            _source.Stop();
    }
}
