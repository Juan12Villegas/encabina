export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");

    if (!query) {
        return new Response(JSON.stringify({ error: "Falta el parámetro de búsqueda" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const response = await fetch(`https://api.deezer.com/search?q=${query}`);
        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch {
        return new Response(JSON.stringify({ error: "Error al buscar música" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}