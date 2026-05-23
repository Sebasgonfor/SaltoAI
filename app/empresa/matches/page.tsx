import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, UserCheck } from 'lucide-react';

export default function MatchesEmpresa() {
  const matches = [
    {
      name: "Camila Silva",
      ics: 82,
      skills: ["Gestión de Redes", "Ventas B2C", "Atención al Cliente"],
      reason: "Alta compatibilidad por 'Tolerancia al Caos'. Resolvió un problema similar manejando el Instagram del negocio de comida de un familiar sin experiencia previa.",
      redFlag: "No tiene contrato formal previo."
    },
    {
      name: "Andrés Bermejo",
      ics: 75,
      skills: ["Soporte Técnico", "Organización Básico", "Atención al Cliente"],
      reason: "Demuestra ser autodidacta. Creó un sistema en Excel para el taller mecánico de su barrio.",
      redFlag: "Poca experiencia directa en redes sociales."
    }
  ];

  return (
    <div className="space-y-8 py-8 w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">Tus Candidatos Compatibles</h1>
          <p className="text-slate-500">Hemos filtrado docenas de perfiles. Estos 2 tienen el mayor <strong className="text-slate-900 font-medium">Índice de Compatibilidad Salto (ICS)</strong>.</p>
        </div>
        <Button variant="outline" className="bg-slate-50">Editar Necesidad</Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 w-full">
        {matches.map((match, i) => (
          <Card key={i} className={`flex flex-col ${i === 0 ? 'border-emerald-200 shadow-md ring-1 ring-emerald-500/20' : ''}`}>
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    {match.name}
                    {i === 0 && <Sparkles size={16} className="text-emerald-500" fill="currentColor" />}
                  </CardTitle>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold font-display ${i === 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {match.ics}%
                  </div>
                  <div className="text-xs text-slate-400 font-medium tracking-wide">ICS Match</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex flex-wrap gap-2 mb-4">
                {match.skills.map(s => (
                  <Badge key={s} variant="secondary" className="bg-slate-100 text-slate-700 font-normal">{s}</Badge>
                ))}
              </div>
              
              <div className="bg-emerald-50 rounded-lg p-4 mb-4 flex-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-1">Por qué hace match</h4>
                <p className="text-sm text-emerald-900 leading-relaxed">{match.reason}</p>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <div className="text-xs text-slate-500 line-clamp-1 flex-1 pr-4">
                  <span className="font-semibold">Nota IA:</span> {match.redFlag}
                </div>
                <Button size="sm" className="gap-2 flex-shrink-0">
                  Contactar <ArrowRight size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed bg-slate-50 border-2 flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
          <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mb-4">
            <UserCheck size={20} />
          </div>
          <h3 className="font-display font-medium text-slate-900 mb-2">Salto promete calidad, no volumen</h3>
          <p className="text-sm text-slate-500 max-w-sm">No verás 100 CVs aquí. Te mostramos solo los candidatos que realmente encajan con tu contexto.</p>
        </Card>
      </div>
    </div>
  );
}
