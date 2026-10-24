"use client";

import * as React from "react";
import Image from "next/image";
import { Outfit } from "next/font/google";
import { createClient } from "@supabase/supabase-js";
import {
  Droplets,
  Minus,
  ShowerHead,
  Target,
  Thermometer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/* -------------------------------------------------------------------------- */
/*  Configuração                                                              */
/* -------------------------------------------------------------------------- */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Faixa de umidade considerada ideal (%). Ajuste para a sua planta.
const IDEAL_MIN = 40;
const IDEAL_MAX = 70;

const OFFLINE_APOS_MS = 2 * 60_000; // sem dados há 2 min = sem sinal
const ATUALIZA_AO_VIVO_MS = 5_000;
const ATUALIZA_HISTORICO_MS = 15_000;
const MAX_LINHAS_HISTORICO = 6_000; // limite de segurança por tabela

const PERIODOS = [
  { key: "1h", label: "1 h", longo: "na última hora", ms: 3_600_000 },
  { key: "6h", label: "6 h", longo: "nas últimas 6 horas", ms: 21_600_000 },
  { key: "24h", label: "24 h", longo: "nas últimas 24 horas", ms: 86_400_000 },
  { key: "7d", label: "7 dias", longo: "nos últimos 7 dias", ms: 604_800_000 },
] as const;
type PeriodoKey = (typeof PERIODOS)[number]["key"];

// Paleta derivada do azul da logo (#6b98ff)
const COR = {
  marca: "#6b98ff",
  marcaClara: "#b9cfff",
  seco: "#ffb86b",
  umido: "#9b8cff",
  temperatura: "#ff8f70",
};

const VARS = {
  "--bg": "#070d1c",
  "--surface": "rgba(14, 23, 50, 0.72)",
  "--surface-2": "rgba(107, 152, 255, 0.07)",
  "--line": "rgba(107, 152, 255, 0.18)",
  "--text": "#eaf0ff",
  "--muted": "#8fa3d1",
  // sobrescreve os tokens do shadcn só dentro desta tela (tooltip, eixos...)
  "--background": "#0e1732",
  "--foreground": "#eaf0ff",
  "--muted-foreground": "#8fa3d1",
  "--border": "rgba(107, 152, 255, 0.28)",
} as React.CSSProperties;

const chartConfig = {
  umidade: { label: "Umidade", color: COR.marca },
  temperatura: { label: "Temperatura", color: COR.temperatura },
} satisfies ChartConfig;

const MUTED = "text-[color:var(--muted)]";

/* -------------------------------------------------------------------------- */
/*  Tipos e utilitários                                                       */
/* -------------------------------------------------------------------------- */

type Ponto = { t: number; v: number };

type AoVivo = {
  umidade: Ponto | null;
  temperatura: Ponto | null;
  regas: number[]; // mais recentes primeiro
  regasHoje: number;
};

type Historico = {
  periodo: PeriodoKey;
  desde: number;
  ate: number;
  umidade: Ponto[];
  temperatura: Ponto[];
  regas: number[]; // ordem crescente
};

async function buscarTudo<T>(
  tabela: string,
  colunas: string,
  desdeISO: string
): Promise<T[]> {
  const PAGINA = 1000;
  const saida: T[] = [];
  for (let de = 0; de < MAX_LINHAS_HISTORICO; de += PAGINA) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .gte("created_at", desdeISO)
      .order("created_at", { ascending: false })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    saida.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return saida;
}

const arred1 = (n: number) => Math.round(n * 10) / 10;

function hora(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativo(agora: number | null, ts: number) {
  if (agora === null) return "";
  const s = Math.max(0, Math.round((agora - ts) / 1000));
  if (s < 10) return "agora";
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function duracao(ms: number) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d} d ${hr} h` : `${d} d`;
}

function rotuloDia(ts: number, agora: number | null) {
  if (agora === null) return hora(ts);
  const base = new Date(agora);
  base.setHours(0, 0, 0, 0);
  const dia = new Date(ts);
  dia.setHours(0, 0, 0, 0);
  const diff = Math.round((base.getTime() - dia.getTime()) / 86_400_000);
  if (diff === 0) return `Hoje, ${hora(ts)}`;
  if (diff === 1) return `Ontem, ${hora(ts)}`;
  const data = new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${data}, ${hora(ts)}`;
}

function resumo(pts: Ponto[]) {
  if (!pts.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let soma = 0;
  for (const p of pts) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
    soma += p.v;
  }
  return { min, max, media: soma / pts.length };
}

function statusUmidade(v: number | null) {
  if (v === null)
    return { label: "Aguardando leitura", dica: "Nenhum dado recebido ainda", cor: COR.marcaClara };
  if (v < IDEAL_MIN)
    return { label: "Solo seco", dica: "Precisa de água", cor: COR.seco };
  if (v > IDEAL_MAX)
    return { label: "Solo encharcado", dica: "Segure a rega", cor: COR.umido };
  return { label: "Umidade ideal", dica: "Nenhuma ação necessária", cor: COR.marca };
}

// Agrupa as leituras em ~96 faixas de tempo, fazendo a média de cada tabela.
// Isso resolve o casamento entre umidade e temperatura, que vêm de tabelas separadas.
function montarSerie(u: Ponto[], te: Ponto[], desde: number, ate: number) {
  const N = 96;
  const passo = (ate - desde) / N;
  const somaU = Array<number>(N + 1).fill(0);
  const contU = Array<number>(N + 1).fill(0);
  const somaT = Array<number>(N + 1).fill(0);
  const contT = Array<number>(N + 1).fill(0);
  const idx = (t: number) =>
    Math.min(N, Math.max(0, Math.floor((t - desde) / passo)));

  for (const p of u) {
    const i = idx(p.t);
    somaU[i] += p.v;
    contU[i]++;
  }
  for (const p of te) {
    const i = idx(p.t);
    somaT[i] += p.v;
    contT[i]++;
  }

  const saida: { t: number; umidade: number | null; temperatura: number | null }[] = [];
  for (let i = 0; i <= N; i++) {
    if (!contU[i] && !contT[i]) continue;
    saida.push({
      t: Math.min(ate, desde + i * passo + passo / 2),
      umidade: contU[i] ? arred1(somaU[i] / contU[i]) : null,
      temperatura: contT[i] ? arred1(somaT[i] / contT[i]) : null,
    });
  }
  return saida;
}

/* -------------------------------------------------------------------------- */
/*  Componentes visuais                                                       */
/* -------------------------------------------------------------------------- */

function Painel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "gap-0 rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface)] py-0 text-[color:var(--text)] shadow-none backdrop-blur-xl",
        className
      )}
    >
      {children}
    </Card>
  );
}

function Medidor({ valor, cor }: { valor: number | null; cor: string }) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const arco = c * 0.75;
  const pct = valor === null ? 0 : Math.min(Math.max(valor, 0), 100) / 100;

  const r2 = 110;
  const c2 = 2 * Math.PI * r2;
  const arco2 = c2 * 0.75;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[19rem]">
      <svg viewBox="0 0 240 240" className="h-full w-full" aria-hidden>
        <g transform="rotate(135 120 120)">
          {/* faixa ideal */}
          <circle
            cx="120"
            cy="120"
            r={r2}
            fill="none"
            stroke={COR.marca}
            strokeOpacity="0.45"
            strokeWidth="3"
            strokeDasharray={`${(arco2 * (IDEAL_MAX - IDEAL_MIN)) / 100} ${c2}`}
            strokeDashoffset={-(arco2 * IDEAL_MIN) / 100}
          />
          {/* trilho */}
          <circle
            cx="120"
            cy="120"
            r={r}
            fill="none"
            stroke="rgba(107,152,255,0.12)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${arco} ${c}`}
          />
          {/* valor */}
          <circle
            cx="120"
            cy="120"
            r={r}
            fill="none"
            stroke={cor}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${arco * pct} ${c}`}
            className="transition-all duration-700 motion-reduce:transition-none"
            style={{ filter: `drop-shadow(0 0 10px ${cor}66)` }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-3">
        <div className="flex items-start leading-none">
          <span className="text-[4.5rem] font-semibold tabular-nums tracking-tight">
            {valor === null ? "--" : Math.round(valor)}
          </span>
          <span className={cn("mt-3 text-2xl font-medium", MUTED)}>%</span>
        </div>
        <span className={cn("mt-1 text-sm", MUTED)}>umidade do solo</span>
      </div>
    </div>
  );
}

function Tendencia({ delta }: { delta: number | null }) {
  if (delta === null)
    return <span className={cn("text-sm", MUTED)}>Tendência indisponível</span>;
  const Icone = delta > 0.5 ? TrendingUp : delta < -0.5 ? TrendingDown : Minus;
  const texto =
    Math.abs(delta) <= 0.5
      ? "Estável em 30 min"
      : `${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta))} pontos em 30 min`;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text)]">
      <Icone className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
      {texto}
    </span>
  );
}

function Numero({
  icone,
  titulo,
  children,
  rodape,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <Painel className="h-full">
      <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
        <div className={cn("flex items-center gap-2 text-sm font-medium", MUTED)}>
          {icone}
          {titulo}
        </div>
        <div className="text-4xl font-semibold leading-none tabular-nums tracking-tight sm:text-5xl">
          {children}
        </div>
        <div className={cn("min-h-[2.5rem] text-sm leading-snug", MUTED)}>{rodape}</div>
      </CardContent>
    </Painel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Página                                                                    */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const [periodo, setPeriodo] = React.useState<PeriodoKey>("24h");
  const [aoVivo, setAoVivo] = React.useState<AoVivo | null>(null);
  const [hist, setHist] = React.useState<Historico | null>(null);
  const [erro, setErro] = React.useState(false);
  const [agora, setAgora] = React.useState<number | null>(null);
  const reqHist = React.useRef(0);

  const periodoAtual = PERIODOS.find((p) => p.key === periodo)!;

  // relógio para os textos "há X min" (só no cliente, evita erro de hidratação)
  React.useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const carregarAoVivo = React.useCallback(async () => {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const [u, t, r, c] = await Promise.all([
      supabase
        .from("historico_umidade")
        .select("created_at, umidade")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("historico_temperatura")
        .select("created_at, temperatura")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("historico_rega")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("historico_rega")
        .select("id", { count: "exact", head: true })
        .gte("created_at", inicioDia.toISOString()),
    ]);

    if (u.error || t.error || r.error || c.error) {
      setErro(true);
      return;
    }
    setErro(false);
    setAoVivo({
      umidade: u.data?.[0]
        ? { t: Date.parse(u.data[0].created_at), v: u.data[0].umidade }
        : null,
      temperatura: t.data?.[0]
        ? { t: Date.parse(t.data[0].created_at), v: t.data[0].temperatura }
        : null,
      regas: (r.data ?? []).map((x) => Date.parse(x.created_at)),
      regasHoje: c.count ?? 0,
    });
  }, []);

  const carregarHistorico = React.useCallback(async () => {
    const id = ++reqHist.current;
    const ate = Date.now();
    const desde = ate - periodoAtual.ms;
    const iso = new Date(desde).toISOString();
    try {
      const [u, te, r] = await Promise.all([
        buscarTudo<{ created_at: string; umidade: number }>(
          "historico_umidade",
          "created_at, umidade",
          iso
        ),
        buscarTudo<{ created_at: string; temperatura: number }>(
          "historico_temperatura",
          "created_at, temperatura",
          iso
        ),
        buscarTudo<{ created_at: string }>("historico_rega", "created_at", iso),
      ]);
      if (id !== reqHist.current) return; // chegou uma resposta mais nova
      setHist({
        periodo,
        desde,
        ate,
        umidade: u.map((x) => ({ t: Date.parse(x.created_at), v: x.umidade })).reverse(),
        temperatura: te
          .map((x) => ({ t: Date.parse(x.created_at), v: x.temperatura }))
          .reverse(),
        regas: r.map((x) => Date.parse(x.created_at)).reverse(),
      });
    } catch {
      if (id === reqHist.current) setErro(true);
    }
  }, [periodo, periodoAtual.ms]);

  React.useEffect(() => {
    carregarAoVivo();
    const id = setInterval(carregarAoVivo, ATUALIZA_AO_VIVO_MS);
    return () => clearInterval(id);
  }, [carregarAoVivo]);

  React.useEffect(() => {
    carregarHistorico();
    const id = setInterval(carregarHistorico, ATUALIZA_HISTORICO_MS);
    return () => clearInterval(id);
  }, [carregarHistorico]);

  /* ----------------------------- dados derivados ---------------------------- */

  const umidadeAtual = aoVivo?.umidade?.v ?? null;
  const tempAtual = aoVivo?.temperatura?.v ?? null;
  const status = statusUmidade(umidadeAtual);

  const ultimoSinal = Math.max(aoVivo?.umidade?.t ?? 0, aoVivo?.temperatura?.t ?? 0);
  const temSinal = ultimoSinal > 0;
  const online = agora !== null && temSinal && agora - ultimoSinal < OFFLINE_APOS_MS;

  const dados = React.useMemo(() => {
    if (!hist) return null;
    const serie = montarSerie(hist.umidade, hist.temperatura, hist.desde, hist.ate);
    const u = resumo(hist.umidade);
    const t = resumo(hist.temperatura);

    let intervaloMedio: number | null = null;
    if (hist.regas.length >= 2) {
      intervaloMedio =
        (hist.regas[hist.regas.length - 1] - hist.regas[0]) / (hist.regas.length - 1);
    }

    const total = hist.umidade.length;
    const seco = hist.umidade.filter((p) => p.v < IDEAL_MIN).length;
    const umido = hist.umidade.filter((p) => p.v > IDEAL_MAX).length;
    const faixa = total
      ? {
          seco: (seco / total) * 100,
          ideal: ((total - seco - umido) / total) * 100,
          umido: (umido / total) * 100,
        }
      : null;

    const ticks = Array.from(
      { length: 5 },
      (_, i) => hist.desde + (i * (hist.ate - hist.desde)) / 4
    );
    const temps = hist.temperatura.map((p) => p.v);
    const dominioTemp: [number, number] = temps.length
      ? [Math.floor(Math.min(...temps) - 2), Math.ceil(Math.max(...temps) + 2)]
      : [0, 40];

    return { serie, u, t, intervaloMedio, faixa, ticks, dominioTemp };
  }, [hist]);

  const delta = React.useMemo(() => {
    if (!hist || !aoVivo?.umidade) return null;
    const alvo = aoVivo.umidade.t - 30 * 60_000;
    let ref: Ponto | null = null;
    for (const p of hist.umidade) {
      if (p.t <= alvo) ref = p;
      else break;
    }
    return ref ? aoVivo.umidade.v - ref.v : null;
  }, [hist, aoVivo]);

  const formatarTick = (t: number) =>
    hist?.periodo === "7d"
      ? new Date(t).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })
      : hora(t);

  const rotuloPeriodo = hist
    ? PERIODOS.find((p) => p.key === hist.periodo)!.longo
    : periodoAtual.longo;

  /* --------------------------------- tela ----------------------------------- */

  return (
    <main
      className={cn(
        outfit.className,
        "relative min-h-screen overflow-x-hidden text-[color:var(--text)]"
      )}
      style={{ ...VARS, backgroundColor: "var(--bg)" }}
    >
      {/* Escala a interface em TVs e telas grandes */}
      <style>{`
        @media (min-width: 1920px) { html { font-size: 112.5%; } }
        @media (min-width: 2560px) { html { font-size: 150%; } }
        @media (min-width: 3200px) { html { font-size: 200%; } }
      `}</style>

      {/* Fundo: luzes suaves + logo em marca d'água */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60rem 38rem at 12% -8%, rgba(107,152,255,0.20), transparent 70%), radial-gradient(50rem 40rem at 100% 100%, rgba(61,99,214,0.22), transparent 70%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/logo.svg"
            alt=""
            width={1200}
            height={558}
            priority
            className="h-auto w-[min(94vw,90rem)] select-none opacity-[0.07]"
          />
        </div>
      </div>

      <div className="relative z-10">
        {/* Cabeçalho */}
        <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-[rgba(7,13,28,0.65)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[110rem] items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
            <Image
              src="/logo.svg"
              alt="Agoa"
              width={297}
              height={138}
              priority
              className="h-10 w-auto sm:h-14"
            />
            <div className="flex items-center gap-3">
              {temSinal && (
                <span className={cn("hidden text-sm sm:inline", MUTED)}>
                  Última leitura {relativo(agora, ultimoSinal)}
                </span>
              )}
              <Badge
                role="status"
                variant="outline"
                className={cn(
                  "gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium",
                  online
                    ? "border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--text)]"
                    : "border-[rgba(255,184,107,0.4)] bg-[rgba(255,184,107,0.08)] text-[#ffd9a8]"
                )}
              >
                <span className="relative flex h-2 w-2">
                  {online && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6b98ff] opacity-60 motion-reduce:hidden" />
                  )}
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: online ? COR.marca : COR.seco }}
                  />
                </span>
                {!temSinal
                  ? "Aguardando dados"
                  : online
                    ? "ESP32 online"
                    : `Sem sinal ${relativo(agora, ultimoSinal)}`}
              </Badge>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[110rem] px-4 pb-10 pt-5 sm:px-8 sm:pt-8">
          {erro && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-[rgba(255,184,107,0.4)] bg-[rgba(255,184,107,0.08)] px-4 py-3 text-sm text-[#ffd9a8]"
            >
              Não foi possível ler o Supabase. Confira as variáveis NEXT_PUBLIC_SUPABASE_URL e
              NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local e as políticas de leitura das tabelas.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
            {/* Medidor de umidade */}
            <Painel className="lg:col-span-4 lg:col-start-1 lg:row-start-1 xl:col-span-3">
              <CardHeader className="px-5 pb-0 pt-5 sm:px-6 sm:pt-6">
                <CardTitle className={cn("flex items-center gap-2 text-sm font-medium", MUTED)}>
                  <Droplets className="h-4 w-4" aria-hidden />
                  Umidade do solo
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
                <Medidor valor={umidadeAtual} cor={status.cor} />

                <div className="text-center">
                  <div
                    className="text-2xl font-semibold tracking-tight"
                    style={{ color: status.cor }}
                  >
                    {status.label}
                  </div>
                  <div className={cn("mt-0.5 text-sm", MUTED)}>{status.dica}</div>
                  <div className="mt-3">
                    <Tendencia delta={delta} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3 text-center">
                  {[
                    { nome: "Mínima", v: dados?.u?.min },
                    { nome: "Média", v: dados?.u?.media },
                    { nome: "Máxima", v: dados?.u?.max },
                  ].map((i) => (
                    <div key={i.nome}>
                      <div className="text-xl font-semibold tabular-nums">
                        {i.v === undefined ? "--" : `${Math.round(i.v)}%`}
                      </div>
                      <div className={cn("text-xs", MUTED)}>{i.nome}</div>
                    </div>
                  ))}
                </div>
                <p className={cn("-mt-2 text-center text-xs", MUTED)}>{rotuloPeriodo}</p>
              </CardContent>
            </Painel>

            {/* Gráfico principal */}
            <Painel className="lg:col-span-8 lg:col-start-5 lg:row-start-1 xl:col-span-9 xl:col-start-4">
              <CardHeader className="flex flex-col gap-4 px-5 pb-2 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    Umidade e temperatura
                  </CardTitle>
                  <CardDescription className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", MUTED)}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR.marca }} />
                      Umidade
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR.temperatura }} />
                      Temperatura
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-0 border-l border-dashed" style={{ borderColor: COR.marcaClara }} />
                      Rega
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-[rgba(107,152,255,0.18)]" />
                      Faixa ideal
                    </span>
                  </CardDescription>
                </div>

                <div
                  role="group"
                  aria-label="Período do gráfico"
                  className="inline-flex self-start rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1"
                >
                  {PERIODOS.map((p) => {
                    const ativo = p.key === periodo;
                    return (
                      <Button
                        key={p.key}
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-pressed={ativo}
                        onClick={() => setPeriodo(p.key)}
                        className={cn(
                          "h-8 rounded-xl px-3.5 text-sm font-medium",
                          ativo
                            ? "bg-[#6b98ff] text-[#06102a] hover:bg-[#6b98ff] hover:text-[#06102a]"
                            : "text-[color:var(--muted)] hover:bg-white/5 hover:text-white"
                        )}
                      >
                        {p.label}
                      </Button>
                    );
                  })}
                </div>
              </CardHeader>

              <CardContent className="relative px-2 pb-4 pt-2 sm:px-4 sm:pb-6">
                {hist && dados && dados.serie.length === 0 && (
                  <div className={cn("absolute inset-0 z-10 flex items-center justify-center text-sm", MUTED)}>
                    Sem leituras {rotuloPeriodo}
                  </div>
                )}
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto h-[20rem] w-full sm:h-[25rem] xl:h-[29rem]"
                >
                  <ComposedChart
                    data={dados?.serie ?? []}
                    margin={{ top: 10, right: 6, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="fillUmidade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-umidade)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-umidade)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(107,152,255,0.10)" />
                    <ReferenceArea
                      yAxisId="u"
                      y1={IDEAL_MIN}
                      y2={IDEAL_MAX}
                      fill={COR.marca}
                      fillOpacity={0.08}
                      ifOverflow="hidden"
                    />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={hist ? [hist.desde, hist.ate] : ["dataMin", "dataMax"]}
                      ticks={dados?.ticks}
                      tickFormatter={formatarTick}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                    />
                    <YAxis
                      yAxisId="u"
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(v) => `${v}%`}
                      width={44}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="t"
                      orientation="right"
                      domain={dados?.dominioTemp ?? [0, 40]}
                      tickFormatter={(v) => `${v}°`}
                      width={38}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      cursor={{ stroke: "rgba(185,207,255,0.4)", strokeDasharray: "3 3" }}
                      content={
                        <ChartTooltipContent
                          className="min-w-[11rem] rounded-xl border-[color:var(--line)] bg-[#0e1732] text-[color:var(--text)] shadow-xl"
                          labelFormatter={(_, payload) => {
                            const t = payload?.[0]?.payload?.t as number | undefined;
                            return t
                              ? new Date(t).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "";
                          }}
                          formatter={(value, name) => {
                            const chave = name as keyof typeof chartConfig;
                            return (
                              <div className="flex w-full items-center justify-between gap-6">
                                <span className="flex items-center gap-2 text-[color:var(--muted)]">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: chartConfig[chave]?.color }}
                                  />
                                  {chartConfig[chave]?.label}
                                </span>
                                <span className="font-semibold tabular-nums text-white">
                                  {Number(value).toFixed(1).replace(".", ",")}
                                  {chave === "umidade" ? "%" : "°C"}
                                </span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    {(hist?.regas ?? []).slice(-40).map((t) => (
                      <ReferenceLine
                        key={t}
                        x={t}
                        yAxisId="u"
                        stroke={COR.marcaClara}
                        strokeOpacity={0.7}
                        strokeDasharray="2 5"
                        ifOverflow="hidden"
                      />
                    ))}
                    <Area
                      yAxisId="u"
                      dataKey="umidade"
                      type="monotone"
                      stroke="var(--color-umidade)"
                      strokeWidth={2.5}
                      fill="url(#fillUmidade)"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="t"
                      dataKey="temperatura"
                      type="monotone"
                      stroke="var(--color-temperatura)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Painel>

            {/* Histórico de regas */}
            <Painel className="lg:col-span-4 lg:col-start-1 lg:row-start-2 xl:col-span-3">
              <CardHeader className="px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
                <CardTitle className={cn("flex items-center gap-2 text-sm font-medium", MUTED)}>
                  <ShowerHead className="h-4 w-4" aria-hidden />
                  Últimas regas
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                {aoVivo && aoVivo.regas.length === 0 ? (
                  <p className={cn("py-6 text-sm", MUTED)}>
                    Nenhuma rega registrada ainda. Quando o ESP32 enviar rega: true, ela aparece aqui.
                  </p>
                ) : (
                  <ul className="divide-y divide-[color:var(--line)]">
                    {(aoVivo?.regas ?? []).slice(0, 6).map((t, i) => (
                      <li key={t} className="flex items-center justify-between gap-3 py-3">
                        <span className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full",
                              i === 0
                                ? "bg-[#6b98ff] text-[#06102a]"
                                : "bg-[color:var(--surface-2)]"
                            )}
                            style={i === 0 ? undefined : { color: COR.marca }}
                          >
                            <Droplets className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="font-medium tabular-nums">{rotuloDia(t, agora)}</span>
                        </span>
                        <span className={cn("text-sm", MUTED)}>{relativo(agora, t)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Painel>

            {/* Números rápidos */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8 lg:col-start-5 lg:row-start-2 lg:gap-5 xl:col-span-9 xl:col-start-4">
              <Numero
                icone={<Thermometer className="h-4 w-4" aria-hidden />}
                titulo="Temperatura do ar"
                rodape={
                  dados?.t
                    ? `Mínima ${Math.round(dados.t.min)}°, máxima ${Math.round(dados.t.max)}° ${rotuloPeriodo}`
                    : "Sem leituras no período"
                }
              >
                {tempAtual === null ? "--" : Math.round(tempAtual)}
                <span className={cn("ml-1 text-2xl font-medium", MUTED)}>°C</span>
              </Numero>

              <Numero
                icone={<ShowerHead className="h-4 w-4" aria-hidden />}
                titulo="Última rega"
                rodape={
                  aoVivo
                    ? aoVivo.regasHoje === 0
                      ? "Nenhuma rega hoje"
                      : `${aoVivo.regasHoje} ${aoVivo.regasHoje === 1 ? "rega" : "regas"} hoje`
                    : ""
                }
              >
                {aoVivo?.regas[0] ? (
                  <>
                    {hora(aoVivo.regas[0])}
                    <span className={cn("ml-3 text-lg font-medium", MUTED)}>
                      {relativo(agora, aoVivo.regas[0])}
                    </span>
                  </>
                ) : (
                  "--"
                )}
              </Numero>

              <Numero
                icone={<Droplets className="h-4 w-4" aria-hidden />}
                titulo="Regas no período"
                rodape={
                  dados?.intervaloMedio
                    ? `Uma rega a cada ${duracao(dados.intervaloMedio)}, em média`
                    : hist && hist.regas.length === 1
                      ? "Só uma rega, ainda sem intervalo médio"
                      : `Nenhuma rega ${rotuloPeriodo}`
                }
              >
                {hist ? hist.regas.length : "--"}
              </Numero>

              <Numero
                icone={<Target className="h-4 w-4" aria-hidden />}
                titulo="Tempo na faixa ideal"
                rodape={
                  dados?.faixa ? (
                    <div className="space-y-2">
                      <div
                        className="flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--surface-2)]"
                        role="img"
                        aria-label={`Seco ${Math.round(dados.faixa.seco)}%, ideal ${Math.round(dados.faixa.ideal)}%, encharcado ${Math.round(dados.faixa.umido)}%`}
                      >
                        <span style={{ width: `${dados.faixa.seco}%`, backgroundColor: COR.seco }} />
                        <span style={{ width: `${dados.faixa.ideal}%`, backgroundColor: COR.marca }} />
                        <span style={{ width: `${dados.faixa.umido}%`, backgroundColor: COR.umido }} />
                      </div>
                      <div className="flex justify-between text-xs tabular-nums">
                        <span style={{ color: COR.seco }}>Seco {Math.round(dados.faixa.seco)}%</span>
                        <span style={{ color: COR.marca }}>Ideal {Math.round(dados.faixa.ideal)}%</span>
                        <span style={{ color: COR.umido }}>Úmido {Math.round(dados.faixa.umido)}%</span>
                      </div>
                    </div>
                  ) : (
                    "Sem leituras no período"
                  )
                }
              >
                {dados?.faixa ? `${Math.round(dados.faixa.ideal)}%` : "--"}
              </Numero>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}