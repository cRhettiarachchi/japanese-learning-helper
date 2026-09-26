"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
export function useReaderSettings() {
  const [settings, setSettings] = useState({
    size: "22",
    spacing: "2.3",
    readings: true,
  });
  useEffect(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("learner.reader-settings.v1") || "null",
      );
      if (
        value &&
        ["18", "22", "26", "30"].includes(value.size) &&
        ["1.8", "2.3", "2.8"].includes(value.spacing)
      )
        setSettings({ ...value, readings: value.readings !== false });
    } catch {}
  }, []);
  function update(patch: Partial<typeof settings>) {
    setSettings((old) => {
      const next = { ...old, ...patch };
      try {
        localStorage.setItem(
          "learner.reader-settings.v1",
          JSON.stringify(next),
        );
      } catch {}
      return next;
    });
  }
  return {
    settings,
    update,
    style: {
      "--reading-size": settings.size + "px",
      "--reading-spacing": settings.spacing,
    } as CSSProperties,
  };
}
export function ReaderSettings({
  settings,
  update,
}: ReturnType<typeof useReaderSettings>) {
  return (
    <div className="reader-settings" aria-label="Reading appearance">
      <label>
        Text size
        <Select
          value={settings.size}
          onValueChange={(size) => update({ size })}
        >
          <SelectTrigger aria-label="Text size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["18", "22", "26", "30"].map((v) => (
              <SelectItem value={v} key={v}>
                {v} px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label>
        Line spacing
        <Select
          value={settings.spacing}
          onValueChange={(spacing) => update({ spacing })}
        >
          <SelectTrigger aria-label="Line spacing">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              ["1.8", "Compact"],
              ["2.3", "Comfortable"],
              ["2.8", "Spacious"],
            ].map(([v, t]) => (
              <SelectItem value={v} key={v}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex items-center gap-2">
        <Switch
          checked={settings.readings}
          onCheckedChange={(readings) => update({ readings })}
          aria-label="Show furigana"
        />
        Furigana
      </label>
    </div>
  );
}
