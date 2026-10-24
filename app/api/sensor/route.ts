import { NextResponse } from 'next/server';

// Função que recebe as requisições do tipo POST (O ESP32 enviando dados para cá)
export async function POST(request: Request) {
  try {
    // Extrai o JSON que o ESP32 enviou no corpo da requisição
    const data = await request.json();
    
    // Mostra no terminal do VS Code o que chegou do ESP32
    console.log("Nova leitura recebida:", data);

    const umidade = data.umidade;

    // TODO: Na próxima etapa do TCC, vamos colocar o código do Supabase aqui 
    // para salvar essa 'umidade' no banco de dados e gerar o histórico.

    // Responde para o ESP32 que deu tudo certo (Status 200)
    return NextResponse.json(
      { message: "Dados recebidos com sucesso pelo servidor!" },
      { status: 200 }
    );

  } catch (error) {
    console.error("Erro ao processar requisição do ESP32:", error);
    // Se der erro (ex: enviou um dado quebrado), avisa o ESP32
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar os dados." },
      { status: 500 }
    );
  }
}