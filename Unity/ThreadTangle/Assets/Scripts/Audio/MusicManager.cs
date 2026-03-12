using System.Collections;
using UnityEngine;

public class MusicManager : MonoBehaviour
{
    [Header("Playlist")]
    [SerializeField] private AudioClip[] tracks;
    [SerializeField] private float musicVolume = 1f;

    [Header("Transition SFX")]
    [SerializeField] private AudioClip[] transitionSfxList;
    [SerializeField] private float sfxVolume = 0.8f;

    private AudioSource musicSource;
    private AudioSource sfxSource;
    private int currentTrack = -1;
    private int lastSfx = -1;

    private void Awake()
    {
        musicSource = gameObject.AddComponent<AudioSource>();
        musicSource.loop = false;
        musicSource.playOnAwake = false;
        musicSource.volume = musicVolume;

        sfxSource = gameObject.AddComponent<AudioSource>();
        sfxSource.loop = false;
        sfxSource.playOnAwake = false;
        sfxSource.volume = sfxVolume;
    }

    private void Start()
    {
        if (tracks == null || tracks.Length == 0) return;
        currentTrack = Random.Range(0, tracks.Length);
        PlayTrack(currentTrack);
        StartCoroutine(PlaylistLoop());
    }

    private void PlayTrack(int index)
    {
        musicSource.clip = tracks[index];
        musicSource.volume = musicVolume;
        musicSource.Play();
    }

    private IEnumerator PlaylistLoop()
    {
        while (true)
        {
            if (musicSource.clip == null) yield break;
            // Bekle: parça bitene kadar
            while (musicSource.isPlaying)
            {
                yield return null;
            }

            // Geçiş SFX ve Flash
            var sfx = PickTransitionSfx();
            if (sfx != null)
            {
                sfxSource.PlayOneShot(sfx, sfxVolume);
                UI.RetroFlashEffect.Trigger();
                yield return new WaitForSecondsRealtime(sfx.length);
            }
            else
            {
                UI.RetroFlashEffect.Trigger();
            }

            // Sonraki parça seç ve çal
            var next = PickNextTrack();
            PlayTrack(next);
        }
    }

    private AudioClip PickTransitionSfx()
    {
        if (transitionSfxList == null || transitionSfxList.Length == 0) return null;
        if (transitionSfxList.Length == 1) { lastSfx = 0; return transitionSfxList[0]; }
        int idx;
        do { idx = Random.Range(0, transitionSfxList.Length); } while (idx == lastSfx);
        lastSfx = idx;
        return transitionSfxList[idx];
    }

    private int PickNextTrack()
    {
        if (tracks.Length == 1) return 0;
        int idx;
        do { idx = Random.Range(0, tracks.Length); } while (idx == currentTrack);
        currentTrack = idx;
        return currentTrack;
    }

    public void Next()
    {
        musicSource.Stop();
    }

    public void Pause()
    {
        musicSource.Pause();
    }

    public void Resume()
    {
        musicSource.UnPause();
    }

    public void SetVolume(float v)
    {
        musicVolume = Mathf.Clamp01(v);
        musicSource.volume = musicVolume;
    }
}

