function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}


function unauthorized() {
  return json({ success: false, error: "Não autorizado" }, 401);
}

function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}

async function listReservations(env) {
  return env.DB.prepare(`
    SELECT
      r.id,
      r.reservation_number,
      r.customer_name,
      r.customer_email,
      r.packs,
      r.quantity_eggs,
      r.status,
      r.reserved_until,
      r.created_at,
      p.name AS product_name
    FROM reservations r
    JOIN products p ON p.id = r.product_id
    ORDER BY
      CASE r.status
        WHEN 'pending' THEN 0
        WHEN 'confirmed' THEN 1
        ELSE 2
      END,
      r.created_at DESC
    LIMIT 200
  `).all();
}

async function changeReservationStatus(env, id, action) {
  const reservation = await env.DB.prepare(`
    SELECT id, product_id, reservation_number, quantity_eggs, status
    FROM reservations
    WHERE id = ?
  `).bind(id).first();

  if (!reservation) return { error: "Reserva não encontrada", status: 404 };

  if (action === "confirm") {
    if (reservation.status !== "pending") return { error: "Só reservas pendentes podem ser confirmadas", status: 409 };
    await env.DB.prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ? AND status = 'pending'").bind(id).run();
    return { success: true, newStatus: "confirmed" };
  }

  if (action === "complete") {
    if (!['pending', 'confirmed'].includes(reservation.status)) return { error: "Esta reserva não pode ser concluída", status: 409 };
    await env.DB.prepare("UPDATE reservations SET status = 'completed' WHERE id = ? AND status IN ('pending','confirmed')").bind(id).run();
    return { success: true, newStatus: "completed" };
  }

  if (action === "cancel") {
    if (!['pending', 'confirmed'].includes(reservation.status)) return { error: "Esta reserva não pode ser cancelada", status: 409 };
    await env.DB.batch([
      env.DB.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ? AND status IN ('pending','confirmed')").bind(id),
      env.DB.prepare(`
        INSERT INTO inventory_movements (
          product_id, movement_type, quantity_eggs,
          reference_type, reference_id, notes
        ) VALUES (?, 'reservation_cancelled', ?, 'reservation', ?, ?)
      `).bind(
        reservation.product_id,
        Number(reservation.quantity_eggs),
        reservation.id,
        `Cancelamento ${reservation.reservation_number}`
      )
    ]);
    return { success: true, newStatus: "cancelled", returnedEggs: Number(reservation.quantity_eggs) };
  }

  return { error: "Ação inválida", status: 400 };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Verifica se o Worker está operacional.
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        success: true,
        service: "doslilinhos-website",
        database: "connected"
      });
    }

    // Consulta o stock atual de ovos.
    if (request.method === "GET" && url.pathname === "/api/stock") {
      try {
        const product = await env.DB
          .prepare(`
            SELECT
              p.id,
              p.code,
              p.name,
              p.units_per_pack,
              COALESCE(SUM(m.quantity_eggs), 0) AS available_eggs
            FROM products p
            LEFT JOIN inventory_movements m
              ON m.product_id = p.id
            WHERE p.code = ?
              AND p.active = 1
            GROUP BY
              p.id,
              p.code,
              p.name,
              p.units_per_pack
          `)
          .bind("OVOS-6")
          .first();

        if (!product) {
          return json(
            {
              success: false,
              error: "Produto não encontrado"
            },
            404
          );
        }

        const availableEggs = Math.max(
          0,
          Number(product.available_eggs || 0)
        );

        const unitsPerPack = Number(
          product.units_per_pack || 6
        );

        return json({
          success: true,
          product: {
            code: product.code,
            name: product.name,
            unitsPerPack
          },
          stock: {
            availableEggs,
            availablePacks: Math.floor(
              availableEggs / unitsPerPack
            ),
            available: availableEggs >= unitsPerPack
          },
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Erro ao consultar stock:", error);

        return json(
          {
            success: false,
            error: "Não foi possível consultar o stock"
          },
          500
        );
      }
    }

    // Devolve erro quando a rota da API não existe.

    if (request.method === "GET" && url.pathname === "/api/admin/reservations") {
      if (!isAdmin(request, env)) return unauthorized();
      try {
        const result = await listReservations(env);
        return json({ success: true, reservations: result.results || [] });
      } catch (error) {
        console.error("Erro ao listar reservas:", error);
        return json({ success: false, error: "Não foi possível obter as reservas" }, 500);
      }
    }

    const adminAction = url.pathname.match(/^\/api\/admin\/reservations\/(\d+)\/(confirm|complete|cancel)$/);
    if (request.method === "POST" && adminAction) {
      if (!isAdmin(request, env)) return unauthorized();
      try {
        const result = await changeReservationStatus(env, Number(adminAction[1]), adminAction[2]);
        if (result.error) return json({ success: false, error: result.error }, result.status);
        return json({ success: true, ...result });
      } catch (error) {
        console.error("Erro ao atualizar reserva:", error);
        return json({ success: false, error: "Não foi possível atualizar a reserva" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        {
          success: false,
          error: "Endpoint não encontrado"
        },
        404
      );
    }

    // Mantém o website normal acessível.
    return env.ASSETS.fetch(request);
  }
};
