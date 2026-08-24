'use client';

import {cloneElement, useId, type ReactElement, type ReactNode} from 'react';
import {CircleHelp} from 'lucide-react';
import {Tooltip} from 'radix-ui';

export function ControlTooltip({content}: {content: string}) {
  return <Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="control-help" aria-label={content}><CircleHelp size={14} /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip-content" side="top" sideOffset={7}>{content}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function ControlHeading({id, label, help, description, value}: {id?: string; label: string; help?: string; description?: string; value?: ReactNode}) {
  return <div className="control-heading"><div className="control-copy"><div className="control-label-line">{id ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}{help ? <ControlTooltip content={help} /> : null}</div>{description ? <small>{description}</small> : null}</div>{value !== undefined ? <output className="control-value">{value}</output> : null}</div>;
}

export function Field({label, help, description, children}: {label: string; help?: string; description?: string; children: ReactElement<{id?: string; 'aria-describedby'?: string}>}) {
  const controlId = useId();
  const descriptionId = description ? `${controlId}-description` : undefined;
  return <div className="control-field"><ControlHeading id={controlId} label={label} help={help} description={description} />{description ? <span id={descriptionId} hidden>{description}</span> : null}{cloneElement(children, {id: controlId, 'aria-describedby': descriptionId})}</div>;
}

export function ControlRow({label, help, description, children}: {label: string; help?: string; description?: string; children: ReactNode}) {
  return <div className="control-field control-field-stack"><ControlHeading label={label} help={help} description={description} />{children}</div>;
}

export function Toggle({label, help, description, checked, onChange}: {label: string; help?: string; description?: string; checked: boolean; onChange: (value: boolean) => void}) {
  const controlId = useId();
  return <div className="control-field"><ControlHeading id={controlId} label={label} help={help} description={description} /><label className="switch" htmlFor={controlId}><input id={controlId} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /><span className="sr-only">{checked ? 'On' : 'Off'}</span></label></div>;
}

export function Range({label, help, description, value, min, max, step, suffix = '', onChange}: {label: string; help?: string; description?: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void}) {
  const controlId = useId();
  return <div className="control-field control-field-stack"><ControlHeading id={controlId} label={label} help={help} description={description} value={`${value}${suffix}`} /><input id={controlId} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

export function Segmented({label, help, description, value, options, onChange}: {label: string; help?: string; description?: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void}) {
  const labelId = useId();
  return <div className="control-field control-field-stack"><div id={labelId}><ControlHeading label={label} help={help} description={description} /></div><div className="segmented-options" role="group" aria-labelledby={labelId}>{options.map(([key, text]) => <button type="button" key={key} className={value === key ? 'active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}</div></div>;
}
