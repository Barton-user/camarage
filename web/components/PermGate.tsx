"use client";
/* Envuelve una pantalla de edición: sin permiso, muestra "solo lectura" y
 * deshabilita todos los controles de adentro (fieldset disabled). */
export default function PermGate({ can, loading, what, children, blockPointer = true }: {
  can: boolean; loading?: boolean; what: string; children: React.ReactNode;
  /** false = los links siguen andando (p.ej. abrir un setlist para verlo); solo se apagan los controles */
  blockPointer?: boolean;
}) {
  const ro = !loading && !can;
  return (
    <>
      {ro && (
        <div className="card mb-4 text-sm" style={{ borderColor: "rgba(251,191,36,0.4)", color: "#fde68a" }}>
          🔒 <b>Solo lectura:</b> no tenés permiso para {what}. Si lo necesitás, pedíselo a quien maneja los integrantes.
        </div>
      )}
      <fieldset disabled={ro}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0, pointerEvents: ro && blockPointer ? "none" : undefined, opacity: ro ? 0.85 : 1 }}>
        {children}
      </fieldset>
    </>
  );
}
