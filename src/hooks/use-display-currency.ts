"use client"

import { useState, useEffect } from "react"

const STORAGE_KEY = "particula_display_currency"
const DEFAULT_CURRENCY = "USD"

export function useDisplayCurrency() {
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setCurrency(stored)
  }, [])

  function setDisplayCurrency(code: string) {
    setCurrency(code)
    localStorage.setItem(STORAGE_KEY, code)
  }

  return { displayCurrency: currency, setDisplayCurrency }
}
