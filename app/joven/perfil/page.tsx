'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Quote, Download, CheckCircle2 } from 'lucide-react';

export default function PerfilJoven() {
  const [perfil, setPerfil] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem('salto_perfil');
    if (data) {
      setPerfil(JSON.parse(data));
    }
  }, []);

  if (!perfil) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-xl font-display font-medium mb-4">Aún no has generado tu Perfil de Evidencia.</h2>
        <Button onClick={() => window.location.href = '/joven/chat'}>Ir a la Entrevista</Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Camila Silva</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" /> Perfil Verificado por Salto IA
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download size={16} /> Generar CV ATS
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Habilidades Deducidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {perfil.skills?.map((skill: string, i: number) => (
              <Badge key={i} variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
                {skill}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rasgos Laborales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {perfil.traits?.map((trait: string, i: number) => (
              <Badge key={i} variant="outline" className="bg-slate-50">
                {trait}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evidencia Extraída (Pruebas)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {perfil.evidence?.map((ev: any, i: number) => (
            <div key={i} className="flex gap-4 align-start relative">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-400 mt-1">
                <Quote size={14} />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900 text-sm">{ev.skill}</h4>
                <p className="text-slate-600 text-sm mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                  "{ev.quote}"
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-emerald-900 text-white border-transparent">
        <CardContent className="p-6 text-center">
          <h3 className="font-display font-medium text-lg mb-2">Las empresas ya pueden verte</h3>
          <p className="text-emerald-100 text-sm mb-4">Tu perfil ha sido indexado y será recomendado a startups por tu Índice de Compatibilidad.</p>
          <Button variant="secondary" className="bg-white text-emerald-900 hover:bg-slate-100">Ver Startups Compatibles</Button>
        </CardContent>
      </Card>
    </div>
  );
}
