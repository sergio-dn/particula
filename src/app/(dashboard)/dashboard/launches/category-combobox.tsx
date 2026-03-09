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
  /** Función que genera la URL para un productType dado (null = sin filtro) */
  buildUrl: (productType: string | null) => string
}

export function CategoryCombobox({ categories, selected, buildUrl }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  function handleSelect(value: string | null) {
    setOpen(false)
    router.push(buildUrl(value))
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
