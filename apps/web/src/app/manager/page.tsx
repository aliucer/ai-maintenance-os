'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTickets, getTicketActions, approveAction, assignTicket, Ticket, AIProposal } from '@/lib/api';

export default function ManagerPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [proposals, setProposals] = useState<AIProposal[]>([]);
    const [vendorName, setVendorName] = useState('Comfort HVAC Pros');
    const [isLoading, setIsLoading] = useState(false);

    const fetchTickets = useCallback(async () => {
        try {
            const data = await getTickets();
            setTickets(data.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ));
        } catch (err) {
            console.error('Failed to fetch tickets:', err);
        }
    }, []);

    const fetchProposals = useCallback(async (ticketId: string) => {
        try {
            const data = await getTicketActions(ticketId);
            // Ensure data is always an array
            setProposals(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch proposals:', err);
            setProposals([]);
        }
    }, []);

    useEffect(() => {
        fetchTickets();
        const interval = setInterval(fetchTickets, 2000);
        return () => clearInterval(interval);
    }, [fetchTickets]);

    useEffect(() => {
        if (selectedTicket) {
            fetchProposals(selectedTicket.id);
        }
    }, [selectedTicket, fetchProposals]);

    const handleApprove = async (proposalId: string) => {
        setIsLoading(true);
        try {
            await approveAction(proposalId);
            if (selectedTicket) {
                await fetchProposals(selectedTicket.id);
            }
            await fetchTickets();
        } catch (err) {
            console.error('Failed to approve:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedTicket) return;
        setIsLoading(true);
        try {
            await assignTicket(selectedTicket.id, vendorName);
            await fetchTickets();
            // Refresh selected ticket
            const updated = await getTickets();
            const refreshed = updated.find(t => t.id === selectedTicket.id);
            if (refreshed) setSelectedTicket(refreshed);
        } catch (err) {
            console.error('Failed to assign:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'NEW': return 'bg-gray-500';
            case 'TRIAGED': return 'bg-blue-500';
            case 'ASSIGNED': return 'bg-yellow-500';
            case 'RESOLVED': return 'bg-green-500';
            default: return 'bg-gray-500';
        }
    };

    const pendingProposals = proposals.filter(p => p.status === 'PROPOSED');

    return (
        <div className="flex h-[calc(100vh-120px)]">
            {/* Ticket List */}
            <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
                <div className="p-4 border-b border-gray-700">
                    <h2 className="font-semibold">Tickets ({tickets.length})</h2>
                </div>
                {tickets.map((ticket) => (
                    <div
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className={`p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors ${selectedTicket?.id === ticket.id ? 'bg-gray-800 border-l-4 border-l-blue-500' : ''
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(ticket.status)}`}>
                                {ticket.status}
                            </span>
                            {ticket.status === 'TRIAGED' && (
                                <span className="px-2 py-0.5 bg-purple-600 rounded text-xs">AI</span>
                            )}
                        </div>
                        <h3 className="font-medium truncate text-white">{ticket.title}</h3>
                        <p className="text-sm text-gray-400 truncate">{ticket.description}</p>
                        <span className="text-xs text-gray-500">
                            {new Date(ticket.createdAt).toLocaleTimeString()}
                        </span>
                    </div>
                ))}
            </div>

            {/* Detail Panel */}
            <div className="flex-1 overflow-y-auto p-6">
                {selectedTicket ? (
                    <div className="space-y-6">
                        {/* Ticket Info */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusColor(selectedTicket.status)}`}>
                                    {selectedTicket.status}
                                </span>
                                <span className="text-gray-500 text-sm">
                                    Priority: {selectedTicket.priority}
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold mb-2 text-white">{selectedTicket.title}</h2>
                            <p className="text-gray-300">{selectedTicket.description}</p>
                        </div>

                        {/* AI Proposal Card */}
                        {pendingProposals.length > 0 && (
                            <div className="bg-purple-900/30 border border-purple-600 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-purple-400 text-lg">🧠</span>
                                    <h3 className="font-semibold text-purple-300">AI Proposal</h3>
                                    {pendingProposals.some(p => p.confidence >= 0.9) && (
                                        <span className="ml-auto bg-green-600 px-2 py-0.5 rounded text-xs">
                                            Auto-Execute Eligible (90%+)
                                        </span>
                                    )}
                                </div>
                                {pendingProposals.map((proposal) => {
                                    const payload = proposal.payload || {};
                                    const hasMemoryMatch = proposal.reasoning?.toLowerCase().includes('similar') ||
                                        proposal.reasoning?.toLowerCase().includes('previous') ||
                                        proposal.reasoning?.toLowerCase().includes('past');
                                    return (
                                        <div key={proposal.id} className="space-y-3">
                                            {/* Memory Match Badge */}
                                            {hasMemoryMatch && (
                                                <div className="bg-purple-800/50 border border-purple-500 rounded px-3 py-2 flex items-center gap-2">
                                                    <span className="text-lg">💡</span>
                                                    <span className="text-purple-200 text-sm font-medium">
                                                        Memory Match Found - AI found similar past incidents
                                                    </span>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <span className="text-sm text-gray-400">Confidence</span>
                                                    <div className={`text-xl font-bold ${proposal.confidence >= 0.9 ? 'text-green-400' :
                                                            proposal.confidence >= 0.7 ? 'text-yellow-400' : 'text-red-400'
                                                        }`}>
                                                        {Math.round(proposal.confidence * 100)}%
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-400">Category</span>
                                                    <div className="font-medium text-white">{payload.category || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-400">Priority</span>
                                                    <div className="font-medium text-white">
                                                        {payload.priority ? `P${payload.priority}` : 'N/A'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <span className="text-sm text-gray-400">Action Type</span>
                                                <div className="font-medium text-blue-300">{proposal.actionType}</div>
                                            </div>

                                            <div>
                                                <span className="text-sm text-gray-400">AI Reasoning</span>
                                                <p className="text-sm mt-1 text-white bg-gray-800 p-2 rounded">{proposal.reasoning}</p>
                                            </div>

                                            <div className="flex gap-2 pt-2">
                                                <button
                                                    onClick={() => handleApprove(proposal.id)}
                                                    disabled={isLoading}
                                                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-2 rounded font-medium"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    disabled={isLoading}
                                                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 py-2 rounded font-medium"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Assign Panel */}
                        {selectedTicket.status === 'TRIAGED' && pendingProposals.length === 0 && (
                            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                                <h3 className="font-semibold mb-3 text-white">Assign Vendor</h3>
                                <div className="space-y-3">
                                    <select
                                        value={vendorName}
                                        onChange={(e) => setVendorName(e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                                    >
                                        <option>Comfort HVAC Pros</option>
                                        <option>Quick Plumbing Co</option>
                                        <option>Elite Electricians</option>
                                    </select>
                                    <button
                                        onClick={handleAssign}
                                        disabled={isLoading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-2 rounded font-medium"
                                    >
                                        {isLoading ? 'Assigning...' : 'Assign Vendor'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Status: Assigned */}
                        {selectedTicket.status === 'ASSIGNED' && (
                            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
                                <h3 className="font-semibold text-yellow-300 mb-2">Waiting for Vendor</h3>
                                <p className="text-gray-400 text-sm">
                                    Vendor has been assigned. Waiting for work completion.
                                </p>
                            </div>
                        )}

                        {/* Status: Resolved */}
                        {selectedTicket.status === 'RESOLVED' && (
                            <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
                                <h3 className="font-semibold text-green-300 mb-2">Resolved</h3>
                                <p className="text-gray-400 text-sm">
                                    This issue has been resolved and stored in memory for future reference.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        Select a ticket to view details
                    </div>
                )}
            </div>
        </div>
    );
}
