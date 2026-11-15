"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FormDensity = "default" | "filter";

const FormDensityContext = createContext<FormDensity>("filter");

/**
 * Provides default form control density for nested modal and toolbar regions.
 */
export function FormDensityProvider({
  density,
  children,
}: {
  density: FormDensity;
  children: ReactNode;
}) {
  return (
    <FormDensityContext.Provider value={density}>
      {children}
    </FormDensityContext.Provider>
  );
}

/**
 * Wraps dedicated multi-field forms so nested Input, Select, and Textarea
 * controls use compact control sizing consistently across pages and dialogs.
 */
export function CompactFormScope({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-form-density="filter" className={cn("group/dialog", className)}>
      <FormDensityProvider density="filter">{children}</FormDensityProvider>
    </div>
  );
}

/**
 * Reads the nearest form density context, defaulting to `"default"`.
 */
export function useFormDensity(): FormDensity {
  return useContext(FormDensityContext);
}
