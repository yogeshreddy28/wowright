'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Volume2 } from 'lucide-react';

let unlockedAudioContext: AudioContext | null = null;
function audioContextClass() { return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext; }
async function prepareOrderAudio() {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return false;
  unlockedAudioContext ||= new AudioContextClass();
  if (unlockedAudioContext.state !== 'running') await unlockedAudioContext.resume();
  return unlockedAudioContext.state === 'running';
}
async function playOrderTone() {
  if (!(await prepareOrderAudio()) || !unlockedAudioContext) return false;
  const context = unlockedAudioContext;
  [0, .25].forEach((offset) => {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.setValueAtTime(660, context.currentTime + offset);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + offset + .14);
    gain.gain.setValueAtTime(.0001, context.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(.14, context.currentTime + offset + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + offset + .22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + offset);
    oscillator.stop(context.currentTime + offset + .23);
  });
  return true;
}
export function shouldNotifyNewOrders(previous: number, current: number, initialized: boolean) { return initialized && current > previous; }
export function shouldRingOrderAlarm(unseen: number, enabled: boolean, unlocked = true) { return unseen > 0 && enabled && unlocked; }
export function useAdminOrderNotifications(_view: string) {
  const [unseen, setUnseen] = useState(0), [soundEnabled, setSoundEnabled] = useState(false), [audioUnlocked, setAudioUnlocked] = useState(false), [audioMessage, setAudioMessage] = useState('');
  const broadcast = useCallback((message: Record<string, unknown>) => { try { const channel = new BroadcastChannel('wow-admin-orders'); channel.postMessage(message); channel.close(); } catch {} }, []);
  const poll = useCallback(async () => { const response = await fetch('/api/admin/notifications/orders', { cache: 'no-store' }); if (!response.ok) return; const data = await response.json() as { initialized: boolean; unseen: number; soundEnabled: boolean }; setSoundEnabled(data.soundEnabled); if (!data.initialized) { await fetch('/api/admin/notifications/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'initialize' }) }); return; } setUnseen(data.unseen); broadcast({ unseen: data.unseen, soundEnabled: data.soundEnabled }); }, [broadcast]);
  useEffect(() => { void poll(); const timer = window.setInterval(poll, 10_000); let channel: BroadcastChannel | null = null; try { channel = new BroadcastChannel('wow-admin-orders'); channel.onmessage = (event) => { if (Number.isFinite(Number(event.data?.unseen))) setUnseen(Number(event.data.unseen)); if (typeof event.data?.soundEnabled === 'boolean') setSoundEnabled(event.data.soundEnabled); }; } catch {} return () => { clearInterval(timer); channel?.close(); }; }, [poll]);
  useEffect(() => {
    if (!soundEnabled || audioUnlocked || localStorage.getItem('wow_admin_alarm_unlocked') !== '1') return;
    void prepareOrderAudio().then(setAudioUnlocked).catch(() => setAudioUnlocked(false));
  }, [soundEnabled, audioUnlocked]);
  useEffect(() => { if (!shouldRingOrderAlarm(unseen, soundEnabled, audioUnlocked)) return; const ring = () => { const now = Date.now(), last = Number(localStorage.getItem('wow_admin_alarm_last_ring') || 0); if (now - last < 7_000) return; localStorage.setItem('wow_admin_alarm_last_ring', String(now)); void playOrderTone(); }; ring(); const timer = window.setInterval(ring, 8_000); return () => clearInterval(timer); }, [unseen, soundEnabled, audioUnlocked]);
  async function saveSound(enabled: boolean) { const response = await fetch('/api/admin/notifications/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sound', enabled }) }); if (!response.ok) return false; setSoundEnabled(enabled); broadcast({ unseen, soundEnabled: enabled }); return true; }
  async function enableSound() { const worked = await playOrderTone(); setAudioUnlocked(worked); if (!worked) { setAudioMessage('Sound could not start. Check this browser tab’s audio permission.'); return; } localStorage.setItem('wow_admin_alarm_unlocked', '1'); await saveSound(true); setAudioMessage('Order alarm is on. Test sound played.'); }
  async function testSound() { const worked = await playOrderTone(); setAudioUnlocked(worked); if (worked) localStorage.setItem('wow_admin_alarm_unlocked', '1'); setAudioMessage(worked ? 'Test sound played.' : 'Sound could not start. Check this browser tab’s audio permission.'); }
  async function muteSound() { await saveSound(false); setAudioMessage('Order alarm muted.'); }
  async function acknowledgeAll() { const response = await fetch('/api/admin/notifications/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'acknowledge_all' }) }); if (response.ok) { setUnseen(0); broadcast({ unseen: 0 }); } }
  return { unseen, soundEnabled, audioUnlocked, audioMessage, enableSound, muteSound, testSound, acknowledgeAll, refresh: poll };
}
export function acknowledgeAdminOrder(orderId: string) { return fetch('/api/admin/notifications/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'acknowledge_order', orderId }) }); }
export function OrderSoundButton({ enabled, unlocked, unseen = 0, message, onEnable, onMute, onTest }: { enabled: boolean; unlocked: boolean; unseen?: number; message?: string; onEnable: () => void; onMute: () => void; onTest: () => void }) {
  const ready = enabled && unlocked;
  return <div className="admin-alarm-control"><span className={ready ? 'alarm-on' : ''}>{ready ? <Bell /> : <BellOff />}Order alarm: <b>{ready ? 'ON' : 'OFF'}</b>{ready && unseen > 0 ? ` · ringing for ${unseen}` : ''}</span>{!ready ? <button type="button" onClick={onEnable}>Enable order alarm</button> : <button type="button" onClick={onMute}>Mute</button>}<button type="button" onClick={onTest}><Volume2 /> Test sound</button>{message && <small role="status">{message}</small>}</div>;
}
