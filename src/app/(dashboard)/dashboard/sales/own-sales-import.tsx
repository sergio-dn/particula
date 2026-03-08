"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface Brand {
  id: string
  name: string
}

interface ParsedRow {
  sku: string
  date: string
  units: number
  revenue: number
  error?: string
}

interface Props {
  brands: Brand[]
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { rows: [], errors: ["El archivo está vacío o no tiene datos"] }

  // Detect separator (comma or semicolon)
  const header = lines[0].toLowerCase()
  const sep = header.includes(";") ? ";" : ","

  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""))

  const skuIdx = headers.findIndex((h) => h === "sku" || h === "codigo" || h === "código")
  const dateIdx = headers.findIndex((h) => h === "date" || h === "fecha")
  const unitsIdx = headers.findIndex((h) => h === "units" || h === "unidades" || h === "cantidad")
  const revenueIdx = headers.findIndex((h) => h === "revenue" || h === "ingreso" || h === "ingresos" || h === "venta")

  const errors: string[] = []
  if (skuIdx === -1) errors.push("Columna 'sku' no encontrada")
  if (dateIdx === -1) errors.push("Columna 'date' o 'fecha' no encontrada")
  if (unitsIdx === -1) errors.push("Columna 'units' o 'unidades' no encontrada")
  if (revenueIdx === -1) errors.push("Columna 'revenue' o 'ingreso' no encontrada")
  if (errors.length > 0) return { rows: [], errors }

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/"/g, ""))
    if (cols.length < 4 || cols.every((c) => c === "")) continue

    const sku = cols[skuIdx] ?? ""
    const date = cols[dateIdx] ?? ""
    const units = parseInt(cols[unitsIdx] ?? "0", 10)
    const revenue = parseFloat(cols[revenueIdx] ?? "0")

    const row: ParsedRow = { sku, date, units, revenue }

    if (!sku) row.error = "SKU vacío"
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) row.error = `Fecha inválida: ${date}`
    else if (isNaN(units) || units < 0) row.error = `Unidades inválidas: ${cols[unitsIdx]}`
    else if (isNaN(revenue) || revenue < 0) row.error = `Revenue inválido: ${cols[revenueIdx]}`

    rows.push(row)
  }

  return { rows, errors }
}

export function OwnSalesImport({ brands }: Props) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("")
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { rows, errors } = parseCsv(text)
      setParsedRows(rows)
      setParseErrors(errors)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const validRows = parsedRows.filter((r) => !r.error)
  const errorRows = parsedRows.filter((r) => r.error)

  async function handleImport() {
    if (!selectedBrandId || validRows.length === 0) return

    setImporting(true)
    try {
      const res = await fetch("/api/own-sales/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          rows: validRows.map((r) => ({
            sku: r.sku,
            date: r.date,
            units: r.units,
            revenue: r.revenue,
          })),
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`${data.imported} registros importados correctamente`)
        setParsedRows([])
        setFileName(null)
        setParseErrors([])
      } else {
        toast.error(data.error || "Error al importar")
      }
    } catch {
      toast.error("Error de conexión al importar")
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setParsedRows([])
    setParseErrors([])
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar ventas propias (CSV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Brand selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Marca:</span>
          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="Seleccionar marca" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {fileName ? fileName : "Arrastra un archivo CSV o haz click para seleccionar"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Columnas esperadas: sku, date (YYYY-MM-DD), units, revenue
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </div>

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
            {parseErrors.map((err, i) => (
              <p key={i} className="text-sm text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Preview */}
        {parsedRows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validRows.length} válidas
              </Badge>
              {errorRows.length > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {errorRows.length} con errores
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Mostrando primeras {Math.min(parsedRows.length, 10)} filas
              </span>
            </div>

            <div className="border rounded-lg overflow-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Unidades</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 10).map((row, i) => (
                    <TableRow key={i} className={row.error ? "bg-red-50/50" : ""}>
                      <TableCell className="text-xs font-mono">{row.sku}</TableCell>
                      <TableCell className="text-xs">{row.date}</TableCell>
                      <TableCell className="text-xs text-right">{row.units.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{row.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {row.error ? (
                          <span className="text-red-600">{row.error}</span>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={!selectedBrandId || validRows.length === 0 || importing}
                onClick={handleImport}
              >
                {importing ? "Importando..." : `Importar ${validRows.length} registros`}
              </Button>
              <Button variant="outline" size="sm" onClick={reset}>
                Limpiar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
