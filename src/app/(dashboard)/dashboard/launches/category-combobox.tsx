"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface CategoryComboboxProps {
  categories: string[]
  selected: string | null
  /** Parámetros base para construir la URL (sin productType) */
  baseParams: { days: string; country?: string; brandId?: string }
}

function buildUrl(params: {
  days: string
  country?: string
  brandId?: string
  productType?: string
}) {
  const parts: string[] = []
  if (params.days) parts.push(`days=${params.days}`)
  if (params.country) parts.push(`country=${params.country}`)
  if (params.brandId) parts.push(`brandId=${params.brandId}`)
  if (params.productType) parts.push(`productType=${encodeURIComponent(params.productType)}`)
  return `/dashboard/launches${parts.length > 0 ? `?${parts.join("&")}` : ""}`
}

export function CategoryCombobox({ categories, selected, baseParams }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  function handleSelect(value: string | null) {
    setOpen(false)
    router.push(buildUrl({ ...baseParams, productType: value ?? undefined }))
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[280px] justify-between text-sm font-normal"
          >
            {selected ?? "Todas las categorías"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar categoría..." />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => handleSelect(null)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Todas las categorías
                </CommandItem>
                {categories.map((cat) => (
                  <CommandItem
                    key={cat}
                    value={cat}
                    onSelect={() => handleSelect(cat)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected === cat ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {cat}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleSelect(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
