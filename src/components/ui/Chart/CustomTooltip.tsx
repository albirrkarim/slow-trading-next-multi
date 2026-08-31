import moment from "moment-timezone";
import React from "react";

/** Tooltip minimal types */
type RechartsPayloadItem = {
    dataKey?: string;
    value?: any;
    color?: string;
};
type SimpleTooltipProps = {
    active?: boolean;
    label?: string | number | undefined;
    payload?: RechartsPayloadItem[] | undefined;
};
type ExtraTooltipProps = {
    textMaps: Map<number, Map<number, string>>;
    names: string[];
};
type MyTooltipProps = SimpleTooltipProps & ExtraTooltipProps;

function CustomTooltip(props: MyTooltipProps) {
    const { active, payload, label, textMaps, names } = props;
    if (!active || !payload || payload.length === 0) return null;

    const labelMs = typeof label === "number" ? label : Number(label);

    const rows = (payload as any[]).map((p: any) => {
        const key = String(p.dataKey ?? "");
        const seriesIdx = parseInt(key.replace(/^s/, ""), 10);
        const value = p.value;
        const seriesName = names[seriesIdx] ?? `Series ${seriesIdx + 1}`;
        const text = textMaps.get(seriesIdx)?.get(labelMs) ?? "";
        return { seriesIdx, seriesName, value, color: p.color, text };
    });

    return (
        <div style={{ background: "white", padding: 8, border: "1px solid #ddd", zIndex: "9999!important" }}>
            <div style={{ fontSize: 12, color: "#333", marginBottom: 6 }}>
                <strong>{moment.utc(labelMs).format("YYYY-MM-DD HH:mm")} UTC</strong>
            </div>
            {rows.map((r: any, i: number) => (
                <div
                    key={i}
                    style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 6,
                    }}
                >
                    <div
                        style={{
                            width: 10,
                            height: 10,
                            background: r.color as string,
                            borderRadius: 2,
                        }}
                    />
                    <div style={{ fontSize: 13 }}>
                        <div>
                            <strong>{r.seriesName}</strong>: {r.value ?? "—"}
                        </div>
                        {r.text && (
                            <div style={{ fontSize: 12, color: "#666" }}>{r.text}</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}


export default React.memo(CustomTooltip);