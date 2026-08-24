'use client';

import {AlertDialog, Dialog} from 'radix-ui';
import {Database, Map, RotateCcw, Settings2, Trash2, X} from 'lucide-react';
import {useTranslation} from 'react-i18next';

const formatBytes = (bytes = 0) => {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

export function HelpDialog({open, setOpen}: {open: boolean; setOpen: (open: boolean) => void}) {
  const {t} = useTranslation();
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>{t('help.title')}</Dialog.Title><Dialog.Description>{t('upload.copy')}</Dialog.Description><section><h3>{t('help.privacyTitle')}</h3><p>{t('help.privacy')}</p></section><section><h3>{t('help.exportTitle')}</h3><ol><li>{t('help.android')}</li><li>{t('help.ios')}</li></ol><a href="https://support.google.com/maps/answer/6258979?hl=en" target="_blank" rel="noreferrer">{t('help.googleHelp')}</a></section><section><h3>{t('help.acknowledgementTitle')}</h3><p>{t('help.acknowledgement')}</p><a href="https://github.com/mahlernim/google-timeline-visualizer" target="_blank" rel="noreferrer">{t('help.acknowledgementLink')}</a></section><Dialog.Close asChild><button className="dialog-close" aria-label={t('common.close')}><X size={17} /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function ShortcutsDialog({open, setOpen}: {open: boolean; setOpen: (open: boolean) => void}) {
  const {t} = useTranslation();
  const shortcuts = [['Space / K', t('player.play')], ['J / L', t('player.reverseForward')], ['← / →', t('player.oneFrame')], ['Shift + ← / →', t('player.oneSecond')], ['Home / End', t('player.startEnd')], ['F', t('player.fullscreen')], ['?', t('player.shortcuts')]];
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content compact-dialog"><Dialog.Title>{t('help.shortcutsTitle')}</Dialog.Title><div className="shortcut-list">{shortcuts.map(([key, action]) => <div key={key}><kbd>{key}</kbd><span>{action}</span></div>)}</div><Dialog.Close asChild><button className="dialog-close" aria-label={t('common.close')}><X size={17} /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function StorageDialog({open, setOpen, storageInfo, resetSettings, deletePresets, deleteHistory, clearMap, clearAll}: {open: boolean; setOpen: (open: boolean) => void; storageInfo: {usage: number; quota: number; persisted: boolean} | null; resetSettings: () => void; deletePresets: () => Promise<void>; deleteHistory: () => Promise<void>; clearMap: () => Promise<void>; clearAll: () => Promise<void>}) {
  const {t} = useTranslation();
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content storage-dialog"><Dialog.Title>{t('storage.title')}</Dialog.Title><Dialog.Description>{t('storage.copy')}</Dialog.Description>{storageInfo ? <div className="storage-meter"><strong>{storageInfo.persisted ? t('storage.persisted') : t('storage.bestEffort')}</strong><span>{t('storage.usage', {used: formatBytes(storageInfo.usage), quota: formatBytes(storageInfo.quota)})}</span><i><b style={{width: `${Math.min(100, storageInfo.usage / Math.max(1, storageInfo.quota) * 100)}%`}} /></i></div> : null}<div className="danger-actions"><ConfirmAction label={t('storage.resetSettings')} icon={<RotateCcw size={15} />} action={async () => resetSettings()} /><ConfirmAction label={t('storage.deletePresets')} icon={<Settings2 size={15} />} action={deletePresets} /><ConfirmAction label={t('storage.deleteHistory')} icon={<Trash2 size={15} />} action={deleteHistory} /><ConfirmAction label={t('storage.clearMap')} icon={<Map size={15} />} action={clearMap} /><ConfirmAction danger label={t('storage.clearAll')} icon={<Database size={15} />} action={clearAll} /></div><Dialog.Close asChild><button className="dialog-close" aria-label={t('common.close')}><X size={17} /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function ConfirmAction({label, icon, action, danger = false}: {label: string; icon: React.ReactNode; action: () => Promise<void>; danger?: boolean}) {
  const {t} = useTranslation();
  return <AlertDialog.Root><AlertDialog.Trigger asChild><button className={danger ? 'danger' : ''}>{icon}{label}</button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay nested" /><AlertDialog.Content className="alert-content"><AlertDialog.Title>{label}</AlertDialog.Title><AlertDialog.Description>{t('storage.confirm')}</AlertDialog.Description><div><AlertDialog.Cancel asChild><button>{t('common.cancel')}</button></AlertDialog.Cancel><AlertDialog.Action asChild><button className="danger" onClick={() => void action()}>{label}</button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
}
