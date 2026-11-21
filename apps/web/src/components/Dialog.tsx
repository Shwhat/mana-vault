// ---------- dialogs: one native dialog element reused for every dialog ----------
import { useEffect, useRef, useState, type ReactNode } from "react";
import { choices, Picker } from "./Picker";

export type FieldType = "text" | "number" | "password" | "check" | "select";
export type Field = [key: string, label: string, value: string | boolean, type?: FieldType, options?: Array<[string, string]>];
export type Values = Record<string, string | boolean>;

type FormSpec = {
  kind: "form";
  title: string;
  fields: Field[];
  onOk: (values: Values) => boolean | void | Promise<boolean | void>;
  okLabel: string;
  extra?: ReactNode;
  width?: number;
};
type CustomSpec = {
  kind: "custom";
  title: string;
  render: (close: () => void) => ReactNode;
  width?: number;
  closeLabel?: string;
};
type Spec = FormSpec | CustomSpec;

let show: ((spec: Spec | null) => void) | null = null;

/** Opens a form dialog. Values are trimmed strings (booleans for check fields). Returning false keeps it open. */
export function dialog(title: string, fields: Field[], onOk: FormSpec["onOk"], okLabel = "OK", extra?: ReactNode, width?: number) {
  show?.({ kind: "form", title, fields, onOk, okLabel, extra, width });
}

/** Opens a dialog with custom content and a Close button. */
export function customDialog(title: string, render: CustomSpec["render"], width?: number, closeLabel = "Close") {
  show?.({ kind: "custom", title, render, width, closeLabel });
}

/** Asks a plain question. Resolves true when the person confirms. */
export function confirmDialog(title: string, question: ReactNode, okLabel = "OK"): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    show?.({
      kind: "form", title, fields: [], okLabel,
      extra: <p className="dlgq">{question}</p>,
      onOk: () => { answered = true; resolve(true); },
    });
    const watch = window.setInterval(() => {
      if (!document.querySelector("dialog#dlg[open]")) {
        window.clearInterval(watch);
        if (!answered) resolve(false);
      }
    }, 150);
  });
}

/** Asks a question with several answers as buttons. Resolves with the answer chosen, or null when the person cancels. */
export function choiceDialog<T extends string>(title: string, question: ReactNode, choices: Array<[T, string, boolean?]>): Promise<T | null> {
  return new Promise((resolve) => {
    let answered = false;
    customDialog(title, (close) => (
      <>
        <p className="dlgq">{question}</p>
        <div className="choicerow">
          {choices.map(([value, label, primary]) => (
            <button key={value} type="button" className={primary ? "btn primary" : "btn"} autoFocus={primary}
              onClick={() => { answered = true; close(); resolve(value); }}>{label}</button>
          ))}
        </div>
      </>
    ), 460, "Cancel");
    const watch = window.setInterval(() => {
      if (!document.querySelector("dialog#dlg[open]")) {
        window.clearInterval(watch);
        if (!answered) resolve(null);
      }
    }, 150);
  });
}

export const isDialogOpen = () => !!document.querySelector("dialog#dlg[open]");

export function closeDialog() {
  show?.(null);
}

export function DialogHost() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const element = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    show = (next) => {
      setSpec(next);
      setBusy(false);
      if (next?.kind === "form") setValues(Object.fromEntries(next.fields.map(([key, , value]) => [key, value])));
    };
    return () => { show = null; };
  }, []);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    if (spec && !node.open) node.showModal();
    if (!spec && node.open) node.close();
    if (spec) {
      // the first field is focused with its text selected, so typing replaces it
      const first = node.querySelector<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("#dlgbody input, #dlgbody .picker, #dlgbody textarea");
      if (first) {
        first.focus();
        if (first instanceof HTMLInputElement && first.type !== "checkbox") first.select();
      } else node.querySelector<HTMLButtonElement>(".dlgbtns .primary")?.focus();
    }
  }, [spec]);

  const close = () => setSpec(null);

  async function submit() {
    if (!spec || spec.kind !== "form" || busy) return;
    const result: Values = {};
    for (const [key, , , type] of spec.fields) {
      const value = values[key];
      result[key] = type === "check" ? value === true : String(value ?? "").trim();
    }
    setBusy(true);
    try {
      const keep = await spec.onOk(result);
      if (keep === false) setBusy(false);
      else setSpec((current) => (current === spec ? null : current));
    } catch {
      setBusy(false);
    }
  }

  return (
    <dialog
      id="dlg"
      ref={element}
      style={spec?.width ? { width: spec.width, maxWidth: "94vw" } : undefined}
      onCancel={(event) => { event.preventDefault(); close(); }}
      // a close event can arrive after the next dialog has already opened (one question right after another); only a
      // dialog that is really closed clears the spec
      onClose={() => { if (!element.current?.open) setSpec(null); }}
    >
      {spec && (
        <form ref={form} method="dialog" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="dlghead">{spec.title}</div>
          <div id="dlgbody">
            {spec.kind === "form" ? (
              <>
                {spec.fields.map(([key, label, , type = "text", options]) => (
                  <div className="prow" key={key}>
                    <label htmlFor={`f-${key}`}>{label}</label>
                    {type === "select" ? (
                      <Picker id={`f-${key}`} label={label} value={String(values[key] ?? "")}
                        onChange={(value) => setValues({ ...values, [key]: value })} options={choices(options ?? [])} />
                    ) : type === "check" ? (
                      <input
                        id={`f-${key}`}
                        type="checkbox"
                        checked={values[key] === true}
                        onChange={(event) => setValues({ ...values, [key]: event.target.checked })}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(); } }}
                      />
                    ) : (
                      <input
                        id={`f-${key}`}
                        type={type}
                        value={String(values[key] ?? "")}
                        autoComplete={type === "password" ? "off" : undefined}
                        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                      />
                    )}
                  </div>
                ))}
                {spec.extra}
              </>
            ) : spec.render(close)}
          </div>
          <div className="dlgbtns">
            {spec.kind === "form" ? (
              <>
                <button type="button" className="btn" onClick={close}>Cancel</button>
                <button type="submit" className="btn primary" disabled={busy}>{spec.okLabel}</button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={close}>{spec.closeLabel}</button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
