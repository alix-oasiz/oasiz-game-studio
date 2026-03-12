using UnityEngine;
using UnityEngine.UI;

namespace MainMenu
{
    public class Settings : MonoBehaviour
    {
        [Header("UI")]
        public Slider volumeSlider;      // 0..1
        public Toggle vibrationToggle;   // ON/OFF
    
        const string K_VOL = "vol_master";   // 0..1
        const string K_HAP = "haptics_on";   // 0/1
    
        void Awake()
        {
            // Load defaults
            float v = PlayerPrefs.GetFloat(K_VOL, 0.7f);
            int   h = PlayerPrefs.GetInt(K_HAP, 1);
    
            if (volumeSlider)   volumeSlider.value = v;
            if (vibrationToggle) vibrationToggle.isOn = (h == 1);
    
            ApplyVolume(v);
            // Bind
            if (volumeSlider)   volumeSlider.onValueChanged.AddListener(OnVolumeChanged);
            if (vibrationToggle) vibrationToggle.onValueChanged.AddListener(OnVibrationChanged);
        }
    
        void OnVolumeChanged(float v)
        {
            PlayerPrefs.SetFloat(K_VOL, v);
            ApplyVolume(v);
        }
    
        void ApplyVolume(float v)
        {
            // Basit global çözüm
            AudioListener.volume = Mathf.Clamp01(v);
            // ileride AudioMixer'e geçersen:
            // mixer.SetFloat("MasterVol", Mathf.Log10(Mathf.Max(0.0001f, v)) * 20f);
        }
    
        void OnVibrationChanged(bool on)
        {
            PlayerPrefs.SetInt(K_HAP, on ? 1 : 0);
            // İsteğe bağlı: kullanıcı açınca küçük bir titreşimle onay ver
            if (on) TryVibrate();
        }
    
        public static void TryVibrate()
        {
            //if (PlayerPrefs.GetInt(K_HAP, 1) == 1)
                //Handheld.Vibrate(); // iOS/Android basit haptic
        }
    }
}
