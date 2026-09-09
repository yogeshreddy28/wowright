'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';

const serviceArea = { minLat: 12.8, maxLat: 13.15, minLon: 77.4, maxLon: 77.8 };
type Point = { latitude: number; longitude: number };

export function mapViewport(center: Point, zoom: number) {
  const lonSpan = 360 / Math.pow(2, zoom - 1.35);
  const latSpan = lonSpan * 0.66;
  return { minLat: center.latitude - latSpan / 2, maxLat: center.latitude + latSpan / 2, minLon: center.longitude - lonSpan / 2, maxLon: center.longitude + lonSpan / 2 };
}

export function AddressLocationPicker({ initialLatitude, initialLongitude }: { initialLatitude?: number | null; initialLongitude?: number | null }) {
  const initial = initialLatitude != null && initialLongitude != null ? { latitude: initialLatitude, longitude: initialLongitude } : null;
  const [point, setPoint] = useState<Point | null>(initial);
  const [center, setCenter] = useState<Point>(initial || { latitude: 12.9716, longitude: 77.5946 });
  const [myLocation, setMyLocation] = useState<Point | null>(null);
  const [zoom, setZoom] = useState(initial ? 17 : 12);
  const [message, setMessage] = useState('');
  const lastSuggestedLine1 = useRef('');
  const reverseTimer = useRef<number | null>(null);
  const view = useMemo(() => mapViewport(center, zoom), [center, zoom]);

  function form() { return (document.activeElement?.closest('form') || document.querySelector('form:has(.address-location-picker)')) as HTMLFormElement | null; }
  function fieldValue(name: string) { const field = form()?.elements.namedItem(name); return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : ''; }
  function setField(name: string, value: string) {
    const field = form()?.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
      field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  const reverse = useCallback(async (latitude: number, longitude: number) => {
    setMessage('Updating the nearby address…');
    try {
      const response = await fetch(`/api/location/reverse?latitude=${latitude}&longitude=${longitude}`);
      const result = await response.json() as { address?: Record<string, string>; error?: string };
      if (!response.ok || !result.address) throw new Error(result.error);
      for (const [name, value] of Object.entries(result.address)) {
        if (!value) continue;
        if (name === 'line1') {
          const current = fieldValue('line1');
          if (current && current !== lastSuggestedLine1.current) continue;
          lastSuggestedLine1.current = value;
        }
        setField(name, value);
      }
      setMessage('Pin updated. Keep your house or apartment details, then confirm the address below.');
    } catch (error) { setMessage(error instanceof Error && error.message ? error.message : 'Pin saved. Check the written address below.'); }
  }, []);
  function scheduleReverse(next: Point) { if (reverseTimer.current) window.clearTimeout(reverseTimer.current); reverseTimer.current = window.setTimeout(() => void reverse(next.latitude, next.longitude), 450); }
  function select(latitude: number, longitude: number, readAddress = true) {
    const next = { latitude: Math.max(serviceArea.minLat, Math.min(serviceArea.maxLat, latitude)), longitude: Math.max(serviceArea.minLon, Math.min(serviceArea.maxLon, longitude)) };
    setPoint(next); if (readAddress) scheduleReverse(next);
  }
  function locate() {
    if (!navigator.geolocation) { setMessage('Location is not supported here. Enter the address and choose the pin manually.'); return; }
    setMessage('Finding your current location…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = { latitude: coords.latitude, longitude: coords.longitude };
      setMyLocation(next); setCenter(next); setZoom(18); select(next.latitude, next.longitude);
    }, () => setMessage('Location permission was not available. Enter the address and place the pin manually.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function move(event: React.PointerEvent<HTMLDivElement>, readAddress = false) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    select(view.maxLat - y * (view.maxLat - view.minLat), view.minLon + x * (view.maxLon - view.minLon), readAddress);
  }
  const left = point ? ((point.longitude - view.minLon) / (view.maxLon - view.minLon)) * 100 : 50;
  const top = point ? ((view.maxLat - point.latitude) / (view.maxLat - view.minLat)) * 100 : 50;
  return <div className="address-location-picker wide">
    <button type="button" className="button secondary location-button" onClick={locate}><LocateFixed /> Use my current location</button>
    <p>We ask only after you tap. Then drag the orange pin or tap the exact building.</p>
    <>
      <div className="address-map-toolbar">
        {myLocation && <button type="button" onClick={() => { setCenter(myLocation); setZoom(18); }}><LocateFixed /> Recenter to my location</button>}
        <span>Street-level delivery pin</span>
        <div><button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(14, z - 1))}><Minus /></button><button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(19, z + 1))}><Plus /></button></div>
      </div>
      <div className="address-map" role="application" aria-label="Delivery map. Tap or drag to place the delivery pin." onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event); }} onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && move(event)} onPointerUp={(event) => { move(event, true); event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <iframe title="Delivery location map" tabIndex={-1} aria-hidden="true" src={`https://www.openstreetmap.org/export/embed.html?bbox=${view.minLon}%2C${view.minLat}%2C${view.maxLon}%2C${view.maxLat}&layer=mapnik${point ? `&marker=${point.latitude}%2C${point.longitude}` : ''}`} />
        {point && <span className="address-map-pin" style={{ left: `${left}%`, top: `${top}%` }}><MapPin /></span>}
      </div>
      <small>Drag the pin or tap the exact entrance. Moving it updates the nearby address without replacing your apartment or house details.</small>
    </>
    <input type="hidden" name="latitude" value={point?.latitude ?? ''} /><input type="hidden" name="longitude" value={point?.longitude ?? ''} />
    {message && <p role="status" className="location-status">{message}</p>}
  </div>;
}
