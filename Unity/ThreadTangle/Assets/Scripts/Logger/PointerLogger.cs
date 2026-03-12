using UnityEngine;
using UnityEngine.EventSystems;

namespace Logger
{
    public class PointerLogger : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public void OnPointerDown(PointerEventData e) { Debug.Log("[PointerLogger] DOWN " + e.position); }
        public void OnDrag(PointerEventData e)       { Debug.Log("[PointerLogger] DRAG " + e.position); }
        public void OnPointerUp(PointerEventData e)  { Debug.Log("[PointerLogger] UP   " + e.position); }
    }
}