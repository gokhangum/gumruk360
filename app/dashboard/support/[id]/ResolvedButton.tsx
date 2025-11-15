"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
type Props = {
  defaultLabel?: string;
  doneLabel?: string;
  className?: string;
};

export default function ResolvedButton({
  defaultLabel,
  doneLabel,
  className = "",
}: Props) {
  const { pending } = useFormStatus();
  const [done, setDone] = React.useState(false);
const tMark = useTranslations("support.ui.markResolved");
const tProg = useTranslations("progress"); // doğru namespace

  // Optimistic: tıklanınca hemen "Çözüldü" yapıyoruz
  const onClick = React.useCallback(() => {
    setDone(true);
  }, []);
const finalDefault = (defaultLabel ?? tMark("title"));
const finalDone = (doneLabel ?? tMark("button"));

  const label = done ? finalDone : (pending ? tProg("processing") : finalDefault);


  return (
    <button
      type="submit"
      onClick={onClick}
      className={className}
      disabled={pending || done}
      title={done ? finalDone : finalDefault}
    >
      {label}
    </button>
  );
}
