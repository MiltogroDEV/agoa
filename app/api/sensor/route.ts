import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Conecta ao Supabase usando as chaves secretas que colocamos no .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const data = await request.json();
    console.log("💧 Nova leitura recebida do ESP32:", data);

    const umidade = data.umidade;

    // Salva a umidade na tabela historico_umidade do banco de dados
    const { error } = await supabase
      .from('historico_umidade')
      .insert([{ umidade: umidade }]);

    if (error) {
      console.error("Erro ao salvar no banco:", error);
      return NextResponse.json({ error: "Erro ao salvar no banco de dados." }, { status: 500 });
    }

    return NextResponse.json(
      { message: "Umidade salva no Supabase com sucesso!" },
      { status: 200 }
    );

  } catch (error) {
    console.error("Erro ao processar requisição do ESP32:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar os dados." },
      { status: 500 }
    );
  }
}