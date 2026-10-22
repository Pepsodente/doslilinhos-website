function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
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
