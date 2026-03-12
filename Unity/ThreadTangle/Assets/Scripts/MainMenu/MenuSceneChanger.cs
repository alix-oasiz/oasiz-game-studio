using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

public class MenuSceneChanger : MonoBehaviour
{
    public FullscreenChannelFX effect;
    
    public void ChangeScene(string sceneName)
    {
        StartCoroutine(SceneChangeNumerator(sceneName));
    }

    IEnumerator SceneChangeNumerator(string sceneName)
    {
        effect.reversePulse = false;
        effect.Pulse();
        yield return new WaitForSeconds(1f);
        SceneManager.LoadScene(sceneName);
    }
}
