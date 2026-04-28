import { createFileRoute } from "@tanstack/react-router";

const AIRTABLE_BASE_ID = "apprsfZ8SqimnvbU8";

type AirtableRecord = { id: string; fields: Record<string, unknown>; createdTime?: string };

export const Route = createFileRoute("/api/airtable")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = process.env.AIRTABLE_TOKEN;
        if (!token) {
          return Response.json({ error: "AIRTABLE_TOKEN is not configured" }, { status: 500 });
        }

        const url = new URL(request.url);
        const tableId = url.searchParams.get("tableId");
        if (!tableId) {
          return Response.json({ error: "tableId is required" }, { status: 400 });
        }

        const filterByFormula = url.searchParams.get("filterByFormula");
        const maxRecordsParam = url.searchParams.get("maxRecords");
        const maxRecords = maxRecordsParam ? parseInt(maxRecordsParam, 10) : undefined;
        const fields = url.searchParams.getAll("fields[]");

        const sortParam = url.searchParams.get("sort");
        let sort: { field: string; direction?: string }[] = [];
        if (sortParam) {
          try {
            const parsed = JSON.parse(sortParam);
            if (Array.isArray(parsed)) sort = parsed;
          } catch {
            return Response.json({ error: "Invalid sort param" }, { status: 400 });
          }
        }

        const allRecords: AirtableRecord[] = [];
        let offset: string | undefined = undefined;

        try {
          do {
            const apiUrl = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`);
            if (filterByFormula) apiUrl.searchParams.set("filterByFormula", filterByFormula);
            if (maxRecords !== undefined) {
              const remaining = maxRecords - allRecords.length;
              apiUrl.searchParams.set("pageSize", String(Math.min(100, remaining)));
            }
            for (const f of fields) apiUrl.searchParams.append("fields[]", f);
            sort.forEach((s, i) => {
              if (s?.field) {
                apiUrl.searchParams.set(`sort[${i}][field]`, s.field);
                if (s.direction) apiUrl.searchParams.set(`sort[${i}][direction]`, s.direction);
              }
            });
            if (offset) apiUrl.searchParams.set("offset", offset);

            const res = await fetch(apiUrl.toString(), {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
              const text = await res.text();
              return Response.json(
                { error: `Airtable API error: ${res.status}`, details: text },
                { status: res.status },
              );
            }

            const json = (await res.json()) as { records: AirtableRecord[]; offset?: string };
            allRecords.push(...json.records);
            offset = json.offset;

            if (maxRecords !== undefined && allRecords.length >= maxRecords) {
              return Response.json({ records: allRecords.slice(0, maxRecords) });
            }
          } while (offset);

          return Response.json({ records: allRecords });
        } catch (err) {
          console.error("Airtable fetch failed:", err);
          return Response.json(
            { error: "Failed to fetch from Airtable", details: String(err) },
            { status: 500 },
          );
        }
      },
      PATCH: async ({ request }) => {
        const token = process.env.AIRTABLE_TOKEN;
        if (!token) {
          return Response.json({ error: "AIRTABLE_TOKEN is not configured" }, { status: 500 });
        }
        let body: { tableId?: string; recordId?: string; fields?: Record<string, unknown> };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const { tableId, recordId, fields } = body;
        if (!tableId || !recordId || !fields || typeof fields !== "object") {
          return Response.json(
            { error: "tableId, recordId and fields are required" },
            { status: 400 },
          );
        }
        try {
          const apiUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}/${recordId}`;
          const res = await fetch(apiUrl, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields, typecast: true }),
          });
          if (!res.ok) {
            const text = await res.text();
            return Response.json(
              { error: `Airtable PATCH error: ${res.status}`, details: text },
              { status: res.status },
            );
          }
          const json = (await res.json()) as AirtableRecord;
          return Response.json({ record: json });
        } catch (err) {
          console.error("Airtable PATCH failed:", err);
          return Response.json(
            { error: "Failed to update Airtable", details: String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
