import { useState, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const URGENCY = {
  alta:  { label: "Alta",  color: "#EF4444", bg: "#FEF2F2", icon: "🔴" },
  media: { label: "Média", color: "#F59E0B", bg: "#FFFBEB", icon: "🟡" },
  baixa: { label: "Baixa", color: "#10B981", bg: "#ECFDF5", icon: "🟢" },
};
const STATUS = {
  pendente:     { label: "Pendente",     color: "#9CA3AF" },
  em_andamento: { label: "Em andamento", color: "#3B82F6" },
  concluida:    { label: "Concluída",    color: "#10B981" },
};

const STORAGE_KEY = "tarefas_v1";
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_FORM = {
  titulo: "", descricao: "", urgencia: "media", prazo: "",
  temPrazo: false, euFaco: true, responsavel: "", status: "pendente", categoria: ""
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadTasks = () => {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
};
const saveTasks = (t) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
};

const isOverdue   = (t) => t.prazo && t.status !== "concluida" && t.prazo < today();
const daysUntil   = (d) => { if (!d) return null; return Math.round((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000); };
const fmtDate     = (d) => { if (!d) return null; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
const getWeekLabel = (dateStr) => {
  if (!dateStr) return null;
  const diff = Math.round((new Date() - new Date(dateStr + "T00:00:00")) / 86400000);
  if (diff < 7)  return "Esta semana";
  if (diff < 14) return "Semana passada";
  if (diff < 21) return "Há 2 semanas";
  if (diff < 28) return "Há 3 semanas";
  return "Mais antigo";
};

// ─── Charts ───────────────────────────────────────────────────────────────────

function DonutChart({ slices, size = 120 }) {
  const r = 42, cx = 60, cy = 60, sw = 14, circ = 2 * Math.PI * r;
  let offset = 0;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      {slices.map((s, i) => {
        const dash = (s.value / total) * circ;
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset + circ / 4} />;
        offset += dash; return el;
      })}
      <text x={cx} y={cy + 5}  textAnchor="middle" fontSize="18" fontWeight="800" fill="#111827">{total}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="9"  fill="#9CA3AF">tarefas</text>
    </svg>
  );
}

function BarChart({ bars }) {
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, padding: "0 4px" }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: b.color }}>{b.value || ""}</div>
          <div style={{ width: "100%", background: b.color, borderRadius: "5px 5px 0 0", height: max ? `${(b.value / max) * 68}px` : "2px", minHeight: b.value ? "4px" : "2px", opacity: b.value ? 1 : 0.2 }} />
          <div style={{ fontSize: 9, color: "#9CA3AF", textAlign: "center", lineHeight: 1.2, maxWidth: 48 }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

function RadialProgress({ pct, color = "#52B788", size = 88 }) {
  const r = 36, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
      <text x="44" y="48" textAnchor="middle" fontSize="17" fontWeight="800" fill="#111827">{pct}%</text>
    </svg>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,    setTasks]    = useState(() => loadTasks() || []);
  const [tab,      setTab]      = useState("lista");
  const [view,     setView]     = useState("lista");
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [editId,   setEditId]   = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState({ urgencia: "todas", status: "todas", euFaco: "todas" });
  const [sort,     setSort]     = useState("urgencia");
  const [search,   setSearch]   = useState("");
  const [toast,    setToast]    = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => { saveTasks(tasks); }, [tasks]);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // ── Filtered + sorted ──
  const filtered = tasks
    .filter(t => {
      if (filter.urgencia !== "todas" && t.urgencia !== filter.urgencia) return false;
      if (filter.status   !== "todas" && t.status   !== filter.status)   return false;
      if (filter.euFaco === "eu"      && !t.euFaco)  return false;
      if (filter.euFaco === "outros"  &&  t.euFaco)  return false;
      if (search && !t.titulo.toLowerCase().includes(search.toLowerCase()) &&
          !(t.descricao || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "urgencia") {
        const o = { alta: 0, media: 1, baixa: 2 };
        if (o[a.urgencia] !== o[b.urgencia]) return o[a.urgencia] - o[b.urgencia];
      }
      if (sort === "prazo" || sort === "urgencia") {
        if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
        if (a.prazo) return -1; if (b.prazo) return 1;
      }
      if (sort === "criacao") return (b.id || 0) - (a.id || 0);
      return 0;
    });

  // ── Dashboard stats ──
  const total       = tasks.length;
  const done        = tasks.filter(t => t.status === "concluida").length;
  const pending     = tasks.filter(t => t.status === "pendente").length;
  const inProgress  = tasks.filter(t => t.status === "em_andamento").length;
  const overdue     = tasks.filter(t => isOverdue(t)).length;
  const doneWithPrazo = tasks.filter(t => t.status === "concluida" && t.prazo).length;
  const doneOnTime    = tasks.filter(t => t.status === "concluida" && t.prazo && t.prazo >= t.criadoEm).length;
  const onTimePct     = doneWithPrazo ? Math.round((doneOnTime / doneWithPrazo) * 100) : (done > 0 ? 100 : 0);

  const urgSlices = [
    { value: tasks.filter(t => t.urgencia === "alta"  && t.status !== "concluida").length, color: "#EF4444" },
    { value: tasks.filter(t => t.urgencia === "media" && t.status !== "concluida").length, color: "#F59E0B" },
    { value: tasks.filter(t => t.urgencia === "baixa" && t.status !== "concluida").length, color: "#10B981" },
  ];

  const periods = ["Esta semana", "Semana passada", "Há 2 semanas", "Há 3 semanas", "Mais antigo"];
  const barData = periods.map((p, i) => ({
    label: ["Esta sem.", "Sem. passada", "Há 2 sem.", "Há 3 sem.", "Antigo"][i],
    value: tasks.filter(t => t.status === "concluida" && getWeekLabel(t.criadoEm) === p).length,
    color: ["#1B6CA8", "#2E86C1", "#52B788", "#74C69D", "#B7E4C7"][i],
  }));

  // ── CRUD ──
  const saveTask = () => {
    if (!form.titulo.trim()) { showToast("Informe um título", "err"); return; }
    if (editId !== null) {
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...form } : t));
      showToast("Tarefa atualizada ✓");
    } else {
      setTasks(prev => [{ ...form, id: Date.now(), criadoEm: today() }, ...prev]);
      showToast("Tarefa criada ✓");
    }
    setForm(EMPTY_FORM); setEditId(null); setView("lista");
  };
  const deleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setView("lista"); setSelected(null); showToast("Tarefa removida");
  };
  const toggleStatus = (id) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      return { ...t, status: t.status === "concluida" ? "pendente" : "concluida" };
    }));
  };
  const openEdit   = (task) => { setForm({ ...EMPTY_FORM, ...task }); setEditId(task.id); setView("nova"); };
  const openDetail = (task) => { setSelected(task); setView("detalhe"); };

  const inListRoot = tab === "lista" && view === "lista";
  const inDash     = tab === "dashboard";

  return (
    <div style={S.root}>

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          {tab === "lista" && view !== "lista" && (
            <button style={S.backBtn} onClick={() => { setView("lista"); setEditId(null); setForm(EMPTY_FORM); }}>←</button>
          )}
          <div>
            <div style={S.headerTitle}>
              {inDash                             && "Dashboard"}
              {tab === "lista" && view === "lista"    && "Minhas Tarefas"}
              {tab === "lista" && view === "nova"     && (editId ? "Editar Tarefa" : "Nova Tarefa")}
              {tab === "lista" && view === "detalhe"  && "Detalhe"}
              {tab === "lista" && view === "filtros"  && "Filtros"}
            </div>
            {inListRoot && (
              <div style={S.headerSub}>
                {pending} pendentes ·{" "}
                {overdue > 0 && <span style={{ color: "#fca5a5" }}>{overdue} vencidas · </span>}
                {done} concluídas
              </div>
            )}
          </div>
        </div>
        {inListRoot && (
          <button style={S.addBtn} onClick={() => { setForm(EMPTY_FORM); setEditId(null); setView("nova"); }}>+ Nova</button>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === "err" ? "#EF4444" : "#10B981" }}>{toast.msg}</div>
      )}

      {/* ══ TAB: LISTA ══ */}
      {tab === "lista" && (
        <>
          {/* Lista principal */}
          {view === "lista" && (
            <div style={S.body}>
              <div style={S.searchRow}>
                <input style={S.searchInput} placeholder="🔍  Buscar tarefas..." value={search} onChange={e => setSearch(e.target.value)} />
                <button style={S.filterBtn} onClick={() => setView("filtros")}>⚙️</button>
              </div>
              <div style={S.sortRow}>
                {[["urgencia", "Por urgência"], ["prazo", "Por prazo"], ["criacao", "Recentes"]].map(([k, l]) => (
                  <button key={k} style={{ ...S.sortTab, ...(sort === k ? S.sortTabActive : {}) }} onClick={() => setSort(k)}>{l}</button>
                ))}
              </div>
              {filtered.length === 0
                ? <div style={S.empty}><div style={{ fontSize: 40 }}>📋</div><div style={{ color: "#9CA3AF", marginTop: 8 }}>Nenhuma tarefa encontrada</div></div>
                : filtered.map(task => {
                    const urg = URGENCY[task.urgencia], days = daysUntil(task.prazo), od = isOverdue(task), isDone = task.status === "concluida";
                    return (
                      <div key={task.id} style={{ ...S.card, opacity: isDone ? 0.55 : 1 }} onClick={() => openDetail(task)}>
                        <div style={S.cardTop}>
                          <button style={{ ...S.checkbox, ...(isDone ? S.checkboxDone : {}) }}
                            onClick={e => { e.stopPropagation(); toggleStatus(task.id); }}>
                            {isDone ? "✓" : ""}
                          </button>
                          <div style={S.cardMain}>
                            <div style={{ ...S.cardTitle, textDecoration: isDone ? "line-through" : "none" }}>{task.titulo}</div>
                            <div style={S.cardMeta}>
                              <span style={{ ...S.badge, background: urg.bg, color: urg.color }}>{urg.icon} {urg.label}</span>
                              {task.euFaco
                                ? <span style={{ ...S.badge, background: "#F5F3FF", color: "#7C3AED" }}>✋ Eu faço</span>
                                : task.responsavel && <span style={{ ...S.badge, background: "#EFF6FF", color: "#3B82F6" }}>👤 {task.responsavel}</span>
                              }
                              {task.categoria && <span style={{ ...S.badge, background: "#F9FAFB", color: "#6B7280" }}>🗂 {task.categoria}</span>}
                            </div>
                          </div>
                        </div>
                        {task.prazo && (
                          <div style={{ ...S.cardPrazo, color: od ? "#EF4444" : days === 0 ? "#F59E0B" : "#9CA3AF" }}>
                            {od ? "⚠️ Vencida · " : days === 0 ? "⏰ Hoje · " : days === 1 ? "📅 Amanhã · " : `📅 ${days}d · `}{fmtDate(task.prazo)}
                          </div>
                        )}
                      </div>
                    );
                  })
              }
              <div style={{ height: 90 }} />
            </div>
          )}

          {/* Nova / Editar */}
          {view === "nova" && (
            <div style={S.body}>
              <Fg label="Título *">
                <input style={S.input} placeholder="O que precisa ser feito?" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </Fg>
              <Fg label="Descrição">
                <textarea style={{ ...S.input, minHeight: 72, resize: "none" }} placeholder="Detalhes opcionais..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </Fg>
              <Fg label="Urgência">
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.entries(URGENCY).map(([k, v]) => (
                    <button key={k} style={{ ...S.urgBtn, ...(form.urgencia === k ? { background: v.bg, borderColor: v.color, color: v.color } : {}) }}
                      onClick={() => setForm(f => ({ ...f, urgencia: k }))}>{v.icon} {v.label}</button>
                  ))}
                </div>
              </Fg>
              <Fg label="Status">
                <select style={S.select} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Fg>
              <Fg label="">
                <div style={S.toggleRow}>
                  <span style={S.label}>Possui prazo?</span>
                  <Toggle on={form.temPrazo} onChange={v => setForm(f => ({ ...f, temPrazo: v, prazo: v ? f.prazo : "" }))} />
                </div>
                {form.temPrazo && <input type="date" style={{ ...S.input, marginTop: 8 }} value={form.prazo} min={today()} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />}
              </Fg>
              <Fg label="">
                <div style={S.toggleRow}>
                  <span style={S.label}>Eu mesmo vou fazer?</span>
                  <Toggle on={form.euFaco} onChange={v => setForm(f => ({ ...f, euFaco: v }))} />
                </div>
                {!form.euFaco && <input style={{ ...S.input, marginTop: 8 }} placeholder="Responsável" value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} />}
              </Fg>
              <Fg label="Categoria (opcional)">
                <input style={S.input} placeholder="Ex: IAgora, Comercial, Financeiro..." value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
              </Fg>
              <button style={S.saveBtn} onClick={saveTask}>{editId ? "💾  Salvar alterações" : "✅  Criar tarefa"}</button>
              <div style={{ height: 40 }} />
            </div>
          )}

          {/* Detalhe */}
          {view === "detalhe" && selected && (() => {
            const task = tasks.find(t => t.id === selected.id) || selected;
            const urg = URGENCY[task.urgencia], days = daysUntil(task.prazo), od = isOverdue(task);
            return (
              <div style={S.body}>
                <div style={S.detailCard}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: urg.bg, color: urg.color, fontSize: 13 }}>{urg.icon} {urg.label}</span>
                    <span style={{ ...S.badge, background: STATUS[task.status].color + "22", color: STATUS[task.status].color, fontSize: 13 }}>{STATUS[task.status].label}</span>
                    {task.categoria && <span style={{ ...S.badge, background: "#F3F4F6", color: "#6B7280", fontSize: 13 }}>🗂 {task.categoria}</span>}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "12px 0 4px", lineHeight: 1.3 }}>{task.titulo}</div>
                  {task.descricao && <div style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>{task.descricao}</div>}
                  <div style={S.detailRows}>
                    {task.prazo && (
                      <DRow label="📅 Prazo">
                        <span style={{ color: od ? "#EF4444" : "#374151", fontWeight: 600 }}>
                          {fmtDate(task.prazo)}
                          <span style={{ fontWeight: 400, color: od ? "#EF4444" : "#9CA3AF", marginLeft: 6 }}>
                            {od ? "(vencida)" : days === 0 ? "(hoje)" : days === 1 ? "(amanhã)" : `(${days} dias)`}
                          </span>
                        </span>
                      </DRow>
                    )}
                    <DRow label="✋ Responsável"><span style={{ color: "#374151", fontWeight: 600 }}>{task.euFaco ? "Eu mesmo" : task.responsavel || "—"}</span></DRow>
                    <DRow label="📆 Criado em"><span style={{ color: "#374151" }}>{fmtDate(task.criadoEm)}</span></DRow>
                  </div>
                </div>
                <div style={S.actionRow}>
                  <button style={{ ...S.actionBtn, background: task.status === "concluida" ? "#F3F4F6" : "#ECFDF5", color: task.status === "concluida" ? "#6B7280" : "#10B981" }}
                    onClick={() => toggleStatus(task.id)}>{task.status === "concluida" ? "↩ Reabrir" : "✓ Concluir"}</button>
                  <button style={{ ...S.actionBtn, background: "#EFF6FF", color: "#3B82F6" }} onClick={() => openEdit(task)}>✏️ Editar</button>
                  <button style={{ ...S.actionBtn, background: "#FEF2F2", color: "#EF4444" }} onClick={() => deleteTask(task.id)}>🗑 Excluir</button>
                </div>
                <div style={{ height: 40 }} />
              </div>
            );
          })()}

          {/* Filtros */}
          {view === "filtros" && (
            <div style={S.body}>
              <Fg label="Urgência">
                <select style={S.select} value={filter.urgencia} onChange={e => setFilter(f => ({ ...f, urgencia: e.target.value }))}>
                  <option value="todas">Todas</option>
                  {Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Fg>
              <Fg label="Status">
                <select style={S.select} value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
                  <option value="todas">Todos</option>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Fg>
              <Fg label="Responsável">
                <select style={S.select} value={filter.euFaco} onChange={e => setFilter(f => ({ ...f, euFaco: e.target.value }))}>
                  <option value="todas">Todos</option>
                  <option value="eu">Só eu faço</option>
                  <option value="outros">Deleguei</option>
                </select>
              </Fg>
              <button style={S.saveBtn} onClick={() => setView("lista")}>Aplicar filtros</button>
              <button style={{ ...S.saveBtn, background: "#F3F4F6", color: "#374151", marginTop: 10 }}
                onClick={() => { setFilter({ urgencia: "todas", status: "todas", euFaco: "todas" }); setView("lista"); }}>
                Limpar filtros
              </button>
            </div>
          )}
        </>
      )}

      {/* ══ TAB: DASHBOARD ══ */}
      {inDash && (
        <div style={S.body}>
          <div style={S.kpiRow}>
            <KPI value={total}     label="Total"      color="#1B6CA8" bg="#EFF6FF" />
            <KPI value={pending}   label="Pendentes"  color="#F59E0B" bg="#FFFBEB" />
            <KPI value={done}      label="Concluídas" color="#10B981" bg="#ECFDF5" />
            <KPI value={overdue}   label="Vencidas"   color="#EF4444" bg="#FEF2F2" />
          </div>

          <div style={S.dashCard}>
            <div style={S.dashCardTitle}>Taxa de conclusão no prazo</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <RadialProgress pct={onTimePct} color={onTimePct >= 70 ? "#10B981" : onTimePct >= 40 ? "#F59E0B" : "#EF4444"} />
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{onTimePct}%</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4, lineHeight: 1.5 }}>das tarefas concluídas<br />entregues no prazo</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <span style={{ ...S.badge, background: "#ECFDF5", color: "#10B981" }}>✓ {done} concluídas</span>
                  {overdue > 0 && <span style={{ ...S.badge, background: "#FEF2F2", color: "#EF4444" }}>⚠️ {overdue} vencidas</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={S.dashCard}>
            <div style={S.dashCardTitle}>Concluídas por período</div>
            <BarChart bars={barData} />
          </div>

          <div style={S.dashCard}>
            <div style={S.dashCardTitle}>Abertas por urgência</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <DonutChart slices={urgSlices} />
              <div style={{ flex: 1 }}>
                {[
                  { label: "Alta",  color: "#EF4444", bg: "#FEF2F2", v: urgSlices[0].value },
                  { label: "Média", color: "#F59E0B", bg: "#FFFBEB", v: urgSlices[1].value },
                  { label: "Baixa", color: "#10B981", bg: "#ECFDF5", v: urgSlices[2].value },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: row.color }} />
                      <span style={{ fontSize: 13, color: "#374151" }}>{row.label}</span>
                    </div>
                    <span style={{ ...S.badge, background: row.bg, color: row.color, minWidth: 28, textAlign: "center" }}>{row.v}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 8, marginTop: 4, fontSize: 11, color: "#9CA3AF" }}>{inProgress} em andamento</div>
              </div>
            </div>
          </div>
          <div style={{ height: 90 }} />
        </div>
      )}

      {/* BOTTOM NAV */}
      <div style={S.bottomNav}>
        <NavBtn icon="📋" label="Tarefas"   active={tab === "lista"}     onClick={() => { setTab("lista"); setView("lista"); }} />
        <NavBtn icon="📊" label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
      </div>
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────
const Fg     = ({ label, children }) => <div style={{ marginBottom: 18 }}>{label && <div style={S.label}>{label}</div>}{children}</div>;
const DRow   = ({ label, children }) => <div style={S.detailRow}><span style={S.detailRowLabel}>{label}</span>{children}</div>;
const Toggle = ({ on, onChange })   => <div style={{ ...S.toggle, background: on ? "#52B788" : "#D1D5DB" }} onClick={() => onChange(!on)}><div style={{ ...S.toggleKnob, transform: on ? "translateX(22px)" : "translateX(2px)" }} /></div>;
const KPI    = ({ value, label, color, bg }) => <div style={{ ...S.kpiCard, background: bg }}><div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div><div style={{ fontSize: 10, color, opacity: 0.75, marginTop: 3, fontWeight: 600 }}>{label}</div></div>;
const NavBtn = ({ icon, label, active, onClick }) => <button style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }} onClick={onClick}><span style={{ fontSize: 20 }}>{icon}</span><span style={{ fontSize: 10, fontWeight: active ? 700 : 500, marginTop: 2 }}>{label}</span></button>;

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root:           { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: "#F9FAFB", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative" },
  header:         { background: "#1B6CA8", color: "#fff", padding: "16px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 10px rgba(27,108,168,0.35)" },
  headerLeft:     { display: "flex", alignItems: "center", gap: 10 },
  headerTitle:    { fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" },
  headerSub:      { fontSize: 11, opacity: 0.8, marginTop: 1 },
  backBtn:        { background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 18, width: 34, height: 34, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  addBtn:         { background: "#52B788", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  body:           { padding: "12px 12px 0" },
  searchRow:      { display: "flex", gap: 8, marginBottom: 10 },
  searchInput:    { flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff" },
  filterBtn:      { background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 18, padding: "0 12px", cursor: "pointer" },
  sortRow:        { display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 2 },
  sortTab:        { background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", color: "#6B7280" },
  sortTabActive:  { background: "#1B6CA8", borderColor: "#1B6CA8", color: "#fff", fontWeight: 700 },
  card:           { background: "#fff", borderRadius: 14, padding: "13px 14px", marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", cursor: "pointer" },
  cardTop:        { display: "flex", gap: 10, alignItems: "flex-start" },
  checkbox:       { width: 24, height: 24, borderRadius: 7, border: "2px solid #D1D5DB", background: "#fff", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", marginTop: 1 },
  checkboxDone:   { background: "#10B981", borderColor: "#10B981" },
  cardMain:       { flex: 1 },
  cardTitle:      { fontSize: 15, fontWeight: 600, color: "#111827", lineHeight: 1.3, marginBottom: 5 },
  cardMeta:       { display: "flex", gap: 5, flexWrap: "wrap" },
  badge:          { fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 8px", display: "inline-block" },
  cardPrazo:      { fontSize: 12, marginTop: 6, marginLeft: 34 },
  empty:          { textAlign: "center", padding: "60px 0", fontSize: 16 },
  label:          { display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 },
  input:          { width: "100%", boxSizing: "border-box", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "11px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", background: "#fff", color: "#111827" },
  select:         { width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "11px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", background: "#fff", color: "#111827" },
  urgBtn:         { flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "9px 4px", fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer", fontWeight: 600, color: "#6B7280" },
  toggleRow:      { display: "flex", justifyContent: "space-between", alignItems: "center" },
  toggle:         { width: 46, height: 26, borderRadius: 13, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 },
  toggleKnob:     { position: "absolute", top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s" },
  saveBtn:        { width: "100%", background: "#1B6CA8", color: "#fff", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" },
  detailCard:     { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  detailRows:     { marginTop: 14, borderTop: "1px solid #F3F4F6", paddingTop: 12 },
  detailRow:      { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F9FAFB", fontSize: 14 },
  detailRowLabel: { color: "#9CA3AF", fontSize: 13 },
  actionRow:      { display: "flex", gap: 8 },
  actionBtn:      { flex: 1, border: "none", borderRadius: 12, padding: "13px 0", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" },
  toast:          { position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 24px", borderRadius: 30, fontWeight: 600, fontSize: 14, zIndex: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", fontFamily: "inherit", whiteSpace: "nowrap" },
  kpiRow:         { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 },
  kpiCard:        { borderRadius: 12, padding: "10px 8px", textAlign: "center" },
  dashCard:       { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  dashCardTitle:  { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px" },
  bottomNav:      { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #E5E7EB", display: "flex", zIndex: 20, boxShadow: "0 -2px 10px rgba(0,0,0,0.06)" },
  navBtn:         { flex: 1, border: "none", background: "transparent", cursor: "pointer", padding: "10px 0 12px", display: "flex", flexDirection: "column", alignItems: "center", color: "#9CA3AF", fontFamily: "inherit" },
  navBtnActive:   { color: "#1B6CA8" },
};
