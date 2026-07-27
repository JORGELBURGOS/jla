// Layout vacío para la página de impresión: anula el CaseShell (sidebar, nav)
// y deja solo el documento del informe — sin menús, sin cabeceras de la app.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
