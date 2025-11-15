// app/ask/[id]/DownloadPdfButton.tsx
"use client"


import React from "react"
import { useTranslations } from "next-intl";

type Props = { questionId: string }


export default function DownloadPdfButton({ questionId }: Props) {
	const t = useTranslations("downloadPdf")
const onClick = React.useCallback(() => {
if (!questionId) return
// Doğrudan endpoint'e yeni sekmede git; sunucu PDF dönecek
const url = `/api/ask/${questionId}/pdf?cb=${Date.now()}`
window.open(url, "_blank", "noopener,noreferrer")
}, [questionId])


return (
<button
type="button"
onClick={onClick}
className="btn text-xs px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white"
title={t("title")}
>
{t("label")}
</button>
)
}