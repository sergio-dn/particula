"use client"

import Link from "next/link"

const DEFAULT_OPTIONS = ["7", "14", "30", "60", "90"] as const

interface PeriodSelectorProps {
  /** Valor actualmente seleccionado */
  current: string
  /** Función para generar la URL de cada opción */
  buildHref: (days: string) => string
  /** Opciones de días a mostrar (default: 7, 14, 30, 60, 90) */
  options?: readonly string[]
}

export function PeriodSelector({ current, buildHref, options = DEFAULT_OPTIONS }: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((d) => (
        <Link
          key={d}
          href={buildHref(d)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            current === d
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-muted"
          }`}
        >
          {d} días
        </Link>
      ))}
    </div>
  )
}
