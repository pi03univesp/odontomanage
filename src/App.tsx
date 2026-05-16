import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDoc,
  setDoc,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Calendar, 
  Package, 
  Users, 
  LogOut, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Menu,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth, db } from './firebase';
import { UserProfile, Patient, Appointment, Material, InventoryLog } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error Handling Spec
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Components
const Button = ({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };
  return (
    <button 
      className={cn('px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2', variants[variant], className)} 
      {...props} 
    />
  );
};

const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)} {...props}>
    {children}
  </div>
);

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn('w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all', className)} 
    {...props} 
  />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select 
    className={cn('w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white', className)} 
    {...props}
  >
    {children}
  </select>
);

// Main App Component
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agenda' | 'inventory' | 'patients'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Data States
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Usuário',
              role: firebaseUser.email === 'CaioHenrique270@gmail.com' ? 'admin' : 'dentist'
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      setPatients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'patients'));

    const unsubAppointments = onSnapshot(collection(db, 'appointments'), (snapshot) => {
      setAppointments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Material)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'materials'));

    const unsubLogs = onSnapshot(collection(db, 'inventoryLogs'), (snapshot) => {
      setInventoryLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryLogs'));

    return () => {
      unsubPatients();
      unsubAppointments();
      unsubMaterials();
      unsubLogs();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <Package size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">OdontoManage</h1>
            <p className="text-gray-600">Acesse sua clínica de forma segura e eficiente.</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-3 text-lg">
            Entrar com Google
          </Button>
          <p className="text-xs text-gray-400">
            Ao entrar, você concorda com nossos termos de serviço.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transition-transform duration-300 lg:relative lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full lg:hidden"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3 border-b border-gray-100">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
            <span className="font-bold text-xl text-gray-900">OdontoManage</span>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <SidebarItem 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')} 
            />
            <SidebarItem 
              icon={<Calendar size={20} />} 
              label="Agenda" 
              active={activeTab === 'agenda'} 
              onClick={() => setActiveTab('agenda')} 
            />
            <SidebarItem 
              icon={<Package size={20} />} 
              label="Estoque" 
              active={activeTab === 'inventory'} 
              onClick={() => setActiveTab('inventory')} 
            />
            <SidebarItem 
              icon={<Users size={20} />} 
              label="Pacientes" 
              active={activeTab === 'patients'} 
              onClick={() => setActiveTab('patients')} 
            />
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 p-2 mb-4">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                alt="Avatar" 
                className="w-10 h-10 rounded-full border border-gray-200"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate capitalize">{profile?.role || 'Dentista'}</p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
              <LogOut size={20} />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40">
          <button className="lg:hidden p-2 -ml-2 text-gray-600" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h2 className="text-lg font-semibold text-gray-900 capitalize">
            {activeTab === 'dashboard' ? 'Painel de Controle' : 
             activeTab === 'agenda' ? 'Agenda de Consultas' : 
             activeTab === 'inventory' ? 'Controle de Estoque' : 'Gestão de Pacientes'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-3 py-1.5 gap-2">
              <Search size={16} className="text-gray-400" />
              <input type="text" placeholder="Buscar..." className="bg-transparent border-none outline-none text-sm w-40" />
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Plus size={20} />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'dashboard' && <DashboardView appointments={appointments} materials={materials} inventoryLogs={inventoryLogs} />}
          {activeTab === 'agenda' && <AgendaView appointments={appointments} patients={patients} />}
          {activeTab === 'inventory' && <InventoryView materials={materials} logs={inventoryLogs} userId={user.uid} />}
          {activeTab === 'patients' && <PatientsView patients={patients} appointments={appointments} />}
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
        active ? "bg-blue-50 text-blue-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Views ---

function DashboardView({ appointments, materials, inventoryLogs }: { appointments: Appointment[], materials: Material[], inventoryLogs: InventoryLog[] }) {
  const stats = useMemo(() => {
    const total = appointments.length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const cancelled = appointments.filter(a => a.status === 'cancelled').length;
    const scheduled = appointments.filter(a => a.status === 'scheduled').length;
    
    const lowStock = materials.filter(m => m.currentStock <= m.minStock).length;
    
    // Appointment Behavior (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return format(d, 'dd/MM');
    });

    const behaviorData = last7Days.map(day => {
      const count = appointments.filter(a => format(parseISO(a.startTime), 'dd/MM') === day).length;
      return { name: day, agendamentos: count };
    });

    // Material Consumption
    const consumptionData = materials.slice(0, 5).map(m => ({
      name: m.name,
      consumo: inventoryLogs.filter(l => l.materialId === m.id && l.type === 'consumption').reduce((acc, curr) => acc + curr.quantity, 0)
    }));

    return { total, completed, cancelled, scheduled, lowStock, behaviorData, consumptionData };
  }, [appointments, materials, inventoryLogs]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard title="Total Consultas" value={stats.total} icon={<Calendar className="text-blue-600" />} color="blue" />
        <KpiCard title="Concluídas" value={stats.completed} icon={<CheckCircle2 className="text-green-600" />} color="green" />
        <KpiCard title="Canceladas" value={stats.cancelled} icon={<Clock className="text-red-600" />} color="red" />
        <KpiCard title="Estoque Baixo" value={stats.lowStock} icon={<AlertTriangle className="text-orange-600" />} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-600" />
            Comportamento de Agendamentos
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.behaviorData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="agendamentos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Package size={20} className="text-blue-600" />
            Consumo de Insumos (Top 5)
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.consumptionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="consumo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Alerts */}
      {stats.lowStock > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-orange-600 mt-0.5" size={20} />
          <div>
            <h4 className="font-semibold text-orange-900">Alerta de Estoque</h4>
            <p className="text-sm text-orange-700">
              Existem {stats.lowStock} materiais com estoque abaixo do mínimo recomendado. Verifique a seção de estoque para realizar novas compras.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, icon, color }: { title: string, value: number, icon: React.ReactNode, color: 'blue' | 'green' | 'red' | 'orange' }) {
  const bgColors = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    red: 'bg-red-50',
    orange: 'bg-orange-50',
  };
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bgColors[color])}>
          {icon}
        </div>
      </div>
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <h4 className="text-2xl font-bold text-gray-900 mt-1">{value}</h4>
    </Card>
  );
}

function AgendaView({ appointments, patients }: { appointments: Appointment[], patients: Patient[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [newAppointment, setNewAppointment] = useState<Partial<Appointment>>({
    status: 'scheduled',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    endTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });

  const handleAddAppointment = async () => {
    if (!newAppointment.patientId || !newAppointment.startTime || !newAppointment.endTime) return;
    try {
      await addDoc(collection(db, 'appointments'), {
        ...newAppointment,
        dentistId: auth.currentUser?.uid,
      });
      setShowModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'appointments');
    }
  };

  const dayAppointments = useMemo(() => {
    return appointments.filter(a => isSameDay(parseISO(a.startTime), currentDate));
  }, [appointments, currentDate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </h3>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft size={20} />
              </Button>
              <Button variant="secondary" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight size={20} />
              </Button>
              <Button onClick={() => setShowModal(true)}>
                <Plus size={20} />
                Novo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-500 uppercase">
                {day}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const hasAppts = appointments.some(a => isSameDay(parseISO(a.startTime), day));
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, currentDate);
              
              return (
                <button 
                  key={i} 
                  onClick={() => setCurrentDate(day)}
                  className={cn(
                    "bg-white p-4 h-24 text-left transition-colors hover:bg-gray-50 relative",
                    !isSameDay(day, monthStart) && day < monthStart && "text-gray-300",
                    day > monthEnd && "text-gray-300",
                    isSelected && "bg-blue-50 ring-2 ring-blue-500 ring-inset z-10"
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium",
                    isToday && "bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full"
                  )}>
                    {format(day, 'd')}
                  </span>
                  {hasAppts && (
                    <div className="mt-2 flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Consultas do Dia
          </h3>
          <div className="space-y-4">
            {dayAppointments.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Nenhuma consulta agendada.</p>
            ) : (
              dayAppointments.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(appt => {
                const patient = patients.find(p => p.id === appt.patientId);
                return (
                  <div key={appt.id} className="flex gap-4 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="text-center min-w-[50px]">
                      <p className="text-sm font-bold text-gray-900">{format(parseISO(appt.startTime), 'HH:mm')}</p>
                      <p className="text-xs text-gray-500">Início</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">{patient?.name || 'Paciente Desconhecido'}</p>
                      <p className="text-xs text-gray-500">{appt.notes || 'Sem observações'}</p>
                    </div>
                    <div className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold uppercase h-fit",
                      appt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 
                      appt.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    )}>
                      {appt.status === 'scheduled' ? 'Agendado' : appt.status === 'completed' ? 'Concluído' : 'Cancelado'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <h3 className="text-xl font-bold">Novo Agendamento</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Paciente</label>
                <Select 
                  value={newAppointment.patientId || ''} 
                  onChange={e => setNewAppointment({ ...newAppointment, patientId: e.target.value })}
                >
                  <option value="">Selecione um paciente</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Início</label>
                  <Input 
                    type="datetime-local" 
                    value={newAppointment.startTime} 
                    onChange={e => setNewAppointment({ ...newAppointment, startTime: e.target.value })} 
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Fim</label>
                  <Input 
                    type="datetime-local" 
                    value={newAppointment.endTime} 
                    onChange={e => setNewAppointment({ ...newAppointment, endTime: e.target.value })} 
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Observações</label>
                <textarea 
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                  rows={3}
                  value={newAppointment.notes || ''}
                  onChange={e => setNewAppointment({ ...newAppointment, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddAppointment}>Agendar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryView({ materials, logs, userId }: { materials: Material[], logs: InventoryLog[], userId: string }) {
  const [showModal, setShowModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    currentStock: 0,
    minStock: 5,
    averageConsumption: 0
  });

  const handleAddMaterial = async () => {
    if (!newMaterial.name || !newMaterial.unit) return;
    try {
      await addDoc(collection(db, 'materials'), newMaterial);
      setShowModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'materials');
    }
  };

  const handleUpdateStock = async (material: Material, amount: number, type: 'consumption' | 'addition') => {
    const newStock = type === 'consumption' ? material.currentStock - amount : material.currentStock + amount;
    if (newStock < 0) return;

    try {
      await updateDoc(doc(db, 'materials', material.id), { currentStock: newStock });
      await addDoc(collection(db, 'inventoryLogs'), {
        materialId: material.id,
        quantity: amount,
        type,
        date: new Date().toISOString(),
        userId
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'materials');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-900">Materiais e Insumos</h3>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={20} />
          Novo Material
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materials.map(material => {
          const isLow = material.currentStock <= material.minStock;
          return (
            <Card key={material.id} className={cn("p-6 border-l-4", isLow ? "border-l-orange-500" : "border-l-blue-500")}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-lg text-gray-900">{material.name}</h4>
                  <p className="text-sm text-gray-500">Unidade: {material.unit}</p>
                </div>
                {isLow && (
                  <div className="bg-orange-100 text-orange-700 p-1.5 rounded-lg" title="Estoque Baixo">
                    <AlertTriangle size={18} />
                  </div>
                )}
              </div>

              <div className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Estoque Atual</p>
                  <p className={cn("text-3xl font-bold", isLow ? "text-orange-600" : "text-gray-900")}>
                    {material.currentStock}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-bold">Mínimo</p>
                  <p className="text-lg font-semibold text-gray-700">{material.minStock}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" size="sm" onClick={() => handleUpdateStock(material, 1, 'consumption')}>
                  -1 Consumo
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleUpdateStock(material, 1, 'addition')}>
                  +1 Adição
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <h3 className="text-xl font-bold">Cadastrar Material</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Nome do Material</label>
                <Input value={newMaterial.name || ''} onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })} placeholder="Ex: Luvas de Látex" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Unidade</label>
                <Input value={newMaterial.unit || ''} onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })} placeholder="Ex: Caixa com 100" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Estoque Inicial</label>
                  <Input type="number" value={newMaterial.currentStock} onChange={e => setNewMaterial({ ...newMaterial, currentStock: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Estoque Mínimo</label>
                  <Input type="number" value={newMaterial.minStock} onChange={e => setNewMaterial({ ...newMaterial, minStock: Number(e.target.value) })} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddMaterial}>Cadastrar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function PatientsView({ patients, appointments }: { patients: Patient[], appointments: Appointment[] }) {
  const [showModal, setShowModal] = useState(false);
  const [newPatient, setNewPatient] = useState<Partial<Patient>>({});

  const handleAddPatient = async () => {
    if (!newPatient.name) return;
    try {
      await addDoc(collection(db, 'patients'), newPatient);
      setShowModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'patients');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-900">Pacientes</h3>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={20} />
          Novo Paciente
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contato</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Última Consulta</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {patients.map(patient => {
                const lastAppt = appointments
                  .filter(a => a.patientId === patient.id && a.status === 'completed')
                  .sort((a, b) => b.startTime.localeCompare(a.startTime))[0];

                return (
                  <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{patient.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{patient.phone || '-'}</p>
                      <p className="text-xs text-gray-400">{patient.email || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">
                        {lastAppt ? format(parseISO(lastAppt.startTime), 'dd/MM/yyyy') : 'Nenhuma'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm">Ver Prontuário</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <h3 className="text-xl font-bold">Cadastrar Paciente</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Nome Completo</label>
                <Input value={newPatient.name || ''} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="Ex: João Silva" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Telefone</label>
                <Input value={newPatient.phone || ''} onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">E-mail</label>
                <Input type="email" value={newPatient.email || ''} onChange={e => setNewPatient({ ...newPatient, email: e.target.value })} placeholder="joao@email.com" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddPatient}>Cadastrar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
