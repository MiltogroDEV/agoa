import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// deve sser assim {"umidade": 45, "temperatura": 28, "rega": true}
export async function POST(request: Request) {
  try {
    const data = await request.json();
    console.log("📡 Dados do ESP32:", data);

    // 1. Salva a Umidade (se existir)
    if (data.umidade !== undefined) {
      await supabase.from('historico_umidade').insert([{ umidade: data.umidade }]);
    }

    // 2. Salva a Temperatura (se existir)
    if (data.temperatura !== undefined) {
      await supabase.from('historico_temperatura').insert([{ temperatura: data.temperatura }]);
    }

    // 3. Regista a Rega (se o ESP32 enviou rega: true)
    if (data.rega === true) {
      await supabase.from('historico_rega').insert([{}]);
    }

    return NextResponse.json({ message: "Dados guardados em todas as tabelas!" }, { status: 200 });
  } catch (error) {
    console.error("Erro na API:", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}