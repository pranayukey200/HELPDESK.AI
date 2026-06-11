import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Home, ShieldCheck, Clock, Briefcase, ArrowRight } from 'lucide-react';
import useTicketStore from '../../store/ticketStore';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import TicketStatusBadge from "../components/TicketStatusBadge";
import { formatTicketId } from "../../utils/format";

function TicketResult() {
    const { activeTicket } = useTicketStore();
    const navigate = useNavigate();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        if (!activeTicket) {
            navigate('/my-tickets');
            return;
        }
        setIsInitializing(false);
    }, [activeTicket, navigate]);

    if (isInitializing || !activeTicket) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-600 animate-bounce mb-4" />
                <h2 className="text-xl font-bold text-gray-900">Loading ticket info...</h2>
            </div>
        );
    }

    return (
        <main className="flex-1 w-full max-w-[1100px] mx-auto px-6 py-10 flex flex-col gap-8">
            <div className="w-full flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-8 shadow-inner ring-8 ring-emerald-50">
                    <CheckCircle2 size={48} className="text-emerald-600" />
                </div>

                <h1 className="text-4xl font-black text-gray-900 mb-2 text-center tracking-tight">
                    Your ticket has been created successfully
                </h1>
                <p className="text-gray-500 text-lg font-medium mb-12 text-center max-w-lg leading-relaxed">
                    We've received your request and our team is reviewing it. You can track updates or view more details.
                </p>

                <Card className="w-full overflow-hidden border-none shadow-xl shadow-emerald-900/5 mb-10">
                    <CardHeader className="bg-emerald-900 px-8 py-4 text-white flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck size={18} className="text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-widest">Ticket Details</span>
                        </CardTitle>
                        <span className="text-emerald-400 font-mono text-sm leading-none pt-0.5">#{formatTicketId(activeTicket.ticket_id)}</span>
                    </CardHeader>
                    <CardContent className="p-8 bg-white grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Category</label>
                                <div className="flex items-center gap-2 font-bold text-gray-800">
                                    <Briefcase size={16} className="text-emerald-600" />
                                    {activeTicket.category || 'N/A'}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Priority</label>
                                <div className="flex items-center gap-2">
                                    {activeTicket.priority && <TicketStatusBadge status={activeTicket.priority} />}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Created At</label>
                                <div className="flex items-center gap-2 font-bold text-gray-800">
                                    <Clock size={16} className="text-emerald-600" />
                                    {activeTicket.created_at ? new Date(activeTicket.created_at).toLocaleString() : 'N/A'}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Status</label>
                                <div className="flex items-center gap-2">
                                    <TicketStatusBadge status={activeTicket.status} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                    <button
                        onClick={() => navigate(`/ticket/${activeTicket.ticket_id}`)}
                        className="px-10 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-sm"
                    >
                        View Ticket Details
                        <ArrowRight size={18} />
                    </button>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-10 py-4 bg-white text-gray-700 border border-gray-200 font-bold rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-sm"
                    >
                        <Home size={18} />
                        Back to Dashboard
                    </button>
                </div>
            </div>
        </main>
    );
}

export default TicketResult;
