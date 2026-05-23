'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function PublicarEmpresa() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simular que el motor matchea
    setTimeout(() => {
      router.push('/empresa/matches');
    }, 1500);
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-8 py-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">Cuéntanos qué necesitas</h1>
        <p className="text-slate-500">No uses jerga corporativa, descríbelo con tus palabras. La IA estructurará el contexto.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="bg-slate-50 border-slate-100">
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de tu Emprendimiento/Startup</label>
              <Input placeholder="Ej. Arepas El Primo" required />
            </div>
          </CardContent>
        </Card>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Describe tu problema real y el contexto (el rol lo armamos nosotros)</label>
          <Textarea 
            placeholder="Ej. Vamos a abrir nuestro primer local la próxima semana y somos un caos. Somos 3 personas. Necesito a alguien proactivo que atienda clientes, maneje nuestro Instagram (no sabemos la clave) y que aguante un ritmo rápido sin estresarse. Ideal si sabe vender." 
            className="h-32 p-4 text-base"
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" type="button" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={loading} className="min-w-[150px]">
            {loading ? 'Buscando matches...' : 'Encontrar Talento'}
          </Button>
        </div>
      </form>
    </div>
  );
}
