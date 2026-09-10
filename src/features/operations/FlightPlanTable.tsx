import type { CSSProperties } from "react";
import { FLIGHT_PLAN_HEADERS, type FlightPlanPreviewRow } from "./flight-plan-model";

export function FlightPlanTable({ rows, zoom }: { rows: FlightPlanPreviewRow[]; zoom: number }) {
  return <div className="flight-plan-scale" style={{ "--flight-plan-zoom": zoom / 100 } as CSSProperties}>
    <section className="panel flight-plan-preview"><div className="flight-plan-preview__scroll"><table>
      <thead><tr>{FLIGHT_PLAN_HEADERS.map((header)=><th key={header}>{header}</th>)}</tr><tr>{FLIGHT_PLAN_HEADERS.map((_,index)=><th key={index}>{index+1}</th>)}</tr></thead>
      <tbody>{rows.map((row)=><tr key={row.crewId}>{row.cells.map((cell,index)=><td key={index}>{cell || " "}</td>)}</tr>)}</tbody>
    </table>{!rows.length&&<div className="flight-plan-preview__empty">Відкрийте параметри та оберіть екіпажі для плану польотів.</div>}</div></section>
  </div>;
}
