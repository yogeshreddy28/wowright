'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, LocateFixed, LockKeyhole, MapPin, Minus, Pencil, Plus, X } from 'lucide-react';

const serviceArea = { minLat: 12.8, maxLat: 13.15, minLon: 77.4, maxLon: 77.8 };
type Point = { latitude: number; longitude: number };
type AddressSnapshot = Record<'line1' | 'line2' | 'locality' | 'city' | 'state' | 'pinCode' | 'landmark', string>;
const addressFields: Array<keyof AddressSnapshot> = ['line1', 'line2', 'locality', 'city', 'state', 'pinCode', 'landmark'];

export function mapViewport(center: Point, zoom: number) {
  const lonSpan = 360 / Math.pow(2, zoom - 1.35);
  const latSpan = lonSpan * 0.66;
  return { minLat: center.latitude - latSpan / 2, maxLat: center.latitude + latSpan / 2, minLon: center.longitude - lonSpan / 2, maxLon: center.longitude + lonSpan / 2 };
}

export function clampDeliveryPoint(point: Point): Point {
  return {
    latitude: Math.max(serviceArea.minLat, Math.min(serviceArea.maxLat, point.latitude)),
    longitude: Math.max(serviceArea.minLon, Math.min(serviceArea.maxLon, point.longitude)),
  };
}

export const preciseGeolocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

export function centerAfterMapDrag(center: Point, view: ReturnType<typeof mapViewport>, dx: number, dy: number, width: number, height: number) {
  return clampDeliveryPoint({
    latitude: center.latitude + (dy / height) * (view.maxLat - view.minLat),
    longitude: center.longitude - (dx / width) * (view.maxLon - view.minLon),
  });
}

export function AddressLocationPicker({ initialLatitude, initialLongitude, initialAccuracy }: { initialLatitude?: number | null; initialLongitude?: number | null; initialAccuracy?: number | null }) {
  const initial = initialLatitude != null && initialLongitude != null ? { latitude: initialLatitude, longitude: initialLongitude } : null;
  const [committed, setCommitted] = useState<Point | null>(initial);
  const [draft, setDraft] = useState<Point>(initial || { latitude: 12.9716, longitude: 77.5946 });
  const [myLocation, setMyLocation] = useState<Point | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(initialAccuracy ?? null);
  const [draftAccuracy, setDraftAccuracy] = useState<number | null>(initialAccuracy ?? null);
  const [zoom, setZoom] = useState(initial ? 17 : 12);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const addressBackup = useRef<AddressSnapshot | null>(null);
  const pointBackup = useRef<{ point: Point | null; accuracy: number | null; zoom: number } | null>(null);
  const reverseTimer = useRef<number | null>(null);
  const gesture = useRef<{ x: number; y: number; center: Point; moved: boolean; view: ReturnType<typeof mapViewport> } | null>(null);
  const lastTap = useRef(0);
  const view = useMemo(() => mapViewport(draft, zoom), [draft, zoom]);

  function form() { return (document.activeElement?.closest('form') || document.querySelector('form:has(.address-location-picker)')) as HTMLFormElement | null; }
  function fieldValue(name: string) { const field = form()?.elements.namedItem(name); return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : ''; }
  function setField(name: string, value: string) {
    const field = form()?.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function snapshotAddress(): AddressSnapshot { return Object.fromEntries(addressFields.map((name) => [name, fieldValue(name)])) as AddressSnapshot; }
  function restoreAddress(snapshot: AddressSnapshot | null) { if (snapshot) for (const [name, value] of Object.entries(snapshot)) setField(name, value); }

  const reverse = useCallback(async (point: Point) => {
    setMessage('Updating the nearby address…');
    try {
      const response = await fetch(`/api/location/reverse?latitude=${point.latitude}&longitude=${point.longitude}`);
      const result = await response.json() as { address?: Record<string, string>; error?: string };
      if (!response.ok || !result.address) throw new Error(result.error);
      for (const [name, value] of Object.entries(result.address)) {
        if (!value) continue;
        if ((name === 'line1' || name === 'line2') && fieldValue(name)) continue;
        setField(name, value);
      }
      setMessage('Address suggestion updated for the pin. Check your house or apartment details.');
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : 'Location selected. Check the written address below.');
    }
  }, []);
  function scheduleReverse(next: Point) {
    if (reverseTimer.current) window.clearTimeout(reverseTimer.current);
    reverseTimer.current = window.setTimeout(() => void reverse(next), 550);
  }
  function enterEdit() {
    if (editing) return;
    addressBackup.current = snapshotAddress();
    pointBackup.current = { point: committed, accuracy, zoom };
    setDraft(committed || draft);
    setDraftAccuracy(accuracy);
    setEditing(true);
    setMessage('Editing location — drag the map or tap a location to adjust.');
  }
  function saveLocation() {
    const next = clampDeliveryPoint(draft);
    setDraft(next); setCommitted(next); setAccuracy(draftAccuracy); setEditing(false);
    pointBackup.current = null; addressBackup.current = null;
    setMessage('Location saved. The map pin and delivery coordinates now match.');
  }
  function cancelEdit() {
    const backup = pointBackup.current;
    if (backup) {
      setCommitted(backup.point);
      setDraft(backup.point || { latitude: 12.9716, longitude: 77.5946 });
      setAccuracy(backup.accuracy); setDraftAccuracy(backup.accuracy); setZoom(backup.zoom);
    }
    restoreAddress(addressBackup.current);
    pointBackup.current = null; addressBackup.current = null; setEditing(false); setMessage('Location changes cancelled.');
  }
  function locate() {
    if (!navigator.geolocation) { setMessage('Location is not supported here. Enter the address and edit the map pin manually.'); return; }
    setMessage('Finding your precise current location…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = clampDeliveryPoint({ latitude: coords.latitude, longitude: coords.longitude });
      setMyLocation(next); setDraft(next); setZoom(18); setDraftAccuracy(coords.accuracy);
      setCommitted(next); setAccuracy(coords.accuracy); setEditing(false);
      setMessage(`Current location selected${Number.isFinite(coords.accuracy) ? ` · accurate to approximately ${Math.round(coords.accuracy)} m` : ''}.`);
      void reverse(next);
    }, (error) => setMessage(error.code === 1 ? 'Location permission was denied. Enter the address and use Edit map location to place the pin.' : 'We could not get an accurate location. Enter the address and place the pin manually.'), preciseGeolocationOptions);
  }
  function recenter() { if (!myLocation) return; setDraft(myLocation); setZoom(18); setDraftAccuracy(accuracy); scheduleReverse(myLocation); }
  function pointAt(event: React.PointerEvent<HTMLDivElement>, currentView = view) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return clampDeliveryPoint({ latitude: currentView.maxLat - y * (currentView.maxLat - currentView.minLat), longitude: currentView.minLon + x * (currentView.maxLon - currentView.minLon) });
  }
  function doubleActivate() { const now = Date.now(); if (now - lastTap.current < 360) enterEdit(); lastTap.current = now; }

  return <div className="address-location-picker wide">
    <div className="location-actions">
      <button type="button" className="button secondary location-button" onClick={locate}><LocateFixed /> Use my current location</button>
      {!editing && committed && <button type="button" className="button secondary location-button" onClick={enterEdit}><Pencil /> Edit map location</button>}
    </div>
    <p>We request location only when you tap. Your saved pin stays locked until you choose to edit it.</p>
    <div className={`address-map-shell ${editing ? 'is-editing' : 'is-locked'}`}>
      <div className="address-map-toolbar">
        <span>{editing ? <><Pencil /> Editing location</> : <><LockKeyhole /> Location locked</>}</span>
        <div>{editing && myLocation && <button type="button" onClick={recenter}><LocateFixed /> <span>Recenter</span></button>}<button type="button" aria-label="Zoom out" disabled={!editing} onClick={() => setZoom((z) => Math.max(14, z - 1))}><Minus /></button><button type="button" aria-label="Zoom in" disabled={!editing} onClick={() => setZoom((z) => Math.min(19, z + 1))}><Plus /></button></div>
      </div>
      {editing && <div className="map-edit-banner">Editing location — drag the map or tap a location to adjust</div>}
      {/* Pointer gestures intentionally live on the map canvas; the labelled Edit/Save/Cancel buttons remain the keyboard path. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div className="address-map" role="application" aria-label={editing ? 'Editing delivery location. Drag the map or tap to place the fixed center pin.' : 'Delivery location locked. Double tap or double click to edit.'}
        onDoubleClick={enterEdit} onTouchEnd={() => { if (!editing) doubleActivate(); }}
        onPointerDown={(event) => { if (!editing) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { x: event.clientX, y: event.clientY, center: draft, moved: false, view }; }}
        onPointerMove={(event) => { if (!editing || !gesture.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const dx = event.clientX - gesture.current.x; const dy = event.clientY - gesture.current.y; if (Math.hypot(dx, dy) > 5) gesture.current.moved = true; setDraft(centerAfterMapDrag(gesture.current.center, gesture.current.view, dx, dy, rect.width, rect.height)); setDraftAccuracy(null); }}
        onPointerUp={(event) => { if (!editing || !gesture.current) return; const currentGesture = gesture.current; const rect = event.currentTarget.getBoundingClientRect(); const next = currentGesture.moved ? centerAfterMapDrag(currentGesture.center, currentGesture.view, event.clientX - currentGesture.x, event.clientY - currentGesture.y, rect.width, rect.height) : pointAt(event, currentGesture.view); gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDraft(next); setDraftAccuracy(null); scheduleReverse(next); }}>
        <iframe title="Delivery location map" tabIndex={-1} aria-hidden="true" src={`https://www.openstreetmap.org/export/embed.html?bbox=${view.minLon}%2C${view.minLat}%2C${view.maxLon}%2C${view.maxLat}&layer=mapnik`} />
        <span className="address-map-pin address-map-pin-center" aria-hidden="true"><MapPin /></span>
        {!editing && <button type="button" className="address-map-lock" onDoubleClick={(event) => { event.stopPropagation(); enterEdit(); }} onTouchEnd={(event) => { event.stopPropagation(); doubleActivate(); }} aria-label="Location locked. Choose Edit map location or double tap to adjust."><LockKeyhole /><span>Pin locked</span><small>Double tap to edit</small></button>}
      </div>
      {editing && <div className="map-edit-actions"><button type="button" className="button secondary" onClick={cancelEdit}><X /> Cancel</button><button type="button" className="button primary" onClick={saveLocation}><Check /> Save location</button></div>}
    </div>
    <small>{editing ? 'The fixed orange pin marks the exact coordinates that will be saved.' : committed ? 'Your delivery location cannot move while the map is locked.' : 'Use your current location, then edit the map if the pin needs adjustment.'}</small>
    <input key={`lat-${committed?.latitude ?? 'empty'}`} type="hidden" name="latitude" value={committed?.latitude ?? ''} readOnly />
    <input key={`lon-${committed?.longitude ?? 'empty'}`} type="hidden" name="longitude" value={committed?.longitude ?? ''} readOnly />
    <input key={`accuracy-${accuracy ?? 'empty'}`} type="hidden" name="locationAccuracy" value={accuracy ?? ''} readOnly />
    {accuracy != null && <p className="location-accuracy"><LocateFixed /> Accurate to approximately {Math.round(accuracy)} m</p>}
    {message && <p role="status" className="location-status">{message}</p>}
  </div>;
}
