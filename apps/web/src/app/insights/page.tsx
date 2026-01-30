'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTickets, Ticket, TENANT_ID } from '@/lib/api';

interface MemoryDoc {
    id: string;
    content: string;
    createdAt: string;
}

interface AuditEntry {
    id: string;
    action: string;
    actorId: string;
    ticketId: string;
    changes: Record<string, unknown>;
    createdAt: string;
}

export default function InsightsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [memories, setMemories] = useState<MemoryDoc[]>([]);
    const [audits, setAudits] = useState<AuditEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'memory' | 'audit'>('overview');

    const fetchAll = useCallback(async () => {
        try {
            // Fetch tickets
            const ticketData = await getTickets();
            setTickets(ticketData);

            // Fetch memories
            const memRes = await fetch(`http://localhost:3000/memories?tenantId=${TENANT_ID}&limit=10`);
            if (memRes.ok) setMemories(await memRes.json());

            // Fetch audit logs
            const auditRes = await fetch(`http://localhost:3000/audit?tenantId=${TENANT_ID}&limit=15`);
            if (auditRes.ok) setAudits(await auditRes.json());
        } catch (err) {
            console.error('Failed to fetch data:', err);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 5000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const stats = {
        total: tickets.length,
        new: tickets.filter(t => t.status === 'NEW').length,
        triaged: tickets.filter(t => t.status === 'TRIAGED').length,
        assigned: tickets.filter(t => t.status === 'ASSIGNED').length,
        resolved: tickets.filter(t => t.status === 'RESOLVED').length,
        memoryCount: memories.length,
        auditCount: audits.length,
    };

    const getActionIcon = (action: string) => {
        if (action.includes('created')) return '📝';
        if (action.includes('approved')) return '✅';
        if (action.includes('rejected')) return '❌';
        if (action.includes('assigned')) return '👷';
        if (action.includes('resolved')) return '🎉';
        if (action.includes('triage')) return '🧠';
        return '📋';
    };

    const formatAction = (action: string) => {
        return action.replace(/\./g, ' ').replace(/_/g, ' ');
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">AI Insights & System Status</h2>
                <span className="text-sm text-gray-400">Auto-refresh: 5s</span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-7 gap-3 mb-6">
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-white">{stats.total}</div>
                    <div className="text-xs text-gray-400">Total Tickets</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-gray-400">{stats.new}</div>
                    <div className="text-xs text-gray-400">New</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-blue-400">{stats.triaged}</div>
                    <div className="text-xs text-gray-400">AI Triaged</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-yellow-400">{stats.assigned}</div>
                    <div className="text-xs text-gray-400">Assigned</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-green-400">{stats.resolved}</div>
                    <div className="text-xs text-gray-400">Resolved</div>
                </div>
                <div className="bg-purple-900/50 rounded-lg p-4 text-center border border-purple-600">
                    <div className="text-3xl font-bold text-purple-400">{stats.memoryCount}</div>
                    <div className="text-xs text-purple-300">Memories</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-gray-300">{stats.auditCount}</div>
                    <div className="text-xs text-gray-400">Audit Events</div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4">
                {(['overview', 'memory', 'audit'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === tab
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        {tab === 'overview' && '📊 Overview'}
                        {tab === 'memory' && '🧠 Memory Bank'}
                        {tab === 'audit' && '📋 Audit Trail'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-gray-800 rounded-lg p-6">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4">System Capabilities</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-700 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">🎯</span>
                                        <h4 className="font-medium text-white">AI Triage</h4>
                                    </div>
                                    <p className="text-sm text-gray-400">
                                        Gemini LLM categorizes tickets, assigns priority (1-5), and provides reasoning.
                                    </p>
                                    <div className="mt-2 text-xs text-blue-400">
                                        {stats.triaged + stats.assigned + stats.resolved} tickets auto-triaged
                                    </div>
                                </div>
                                <div className="bg-gray-700 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">🔐</span>
                                        <h4 className="font-medium text-white">Governed Actions</h4>
                                    </div>
                                    <p className="text-sm text-gray-400">
                                        AI proposes actions, managers approve. Auto-execute at 90%+ confidence.
                                    </p>
                                    <div className="mt-2 text-xs text-green-400">
                                        Human-in-the-loop safety
                                    </div>
                                </div>
                                <div className="bg-gray-700 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">🧠</span>
                                        <h4 className="font-medium text-white">RAG Memory</h4>
                                    </div>
                                    <p className="text-sm text-gray-400">
                                        PGVector stores resolutions. Similar tickets get better recommendations.
                                    </p>
                                    <div className="mt-2 text-xs text-purple-400">
                                        {stats.memoryCount} resolutions stored
                                    </div>
                                </div>
                                <div className="bg-gray-700 rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">📡</span>
                                        <h4 className="font-medium text-white">Event-Driven</h4>
                                    </div>
                                    <p className="text-sm text-gray-400">
                                        Kafka/Redpanda for async processing. Transactional outbox pattern.
                                    </p>
                                    <div className="mt-2 text-xs text-yellow-400">
                                        At-least-once delivery guaranteed
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* How RAG Works */}
                        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-300 mb-3">How Memory Improves Over Time</h4>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="flex-1 text-center p-3 bg-gray-800 rounded">
                                    <div className="text-2xl mb-1">📝</div>
                                    <div className="text-gray-300">Ticket Created</div>
                                </div>
                                <div className="text-gray-500">→</div>
                                <div className="flex-1 text-center p-3 bg-gray-800 rounded">
                                    <div className="text-2xl mb-1">🧠</div>
                                    <div className="text-gray-300">AI Searches Memory</div>
                                </div>
                                <div className="text-gray-500">→</div>
                                <div className="flex-1 text-center p-3 bg-gray-800 rounded">
                                    <div className="text-2xl mb-1">✅</div>
                                    <div className="text-gray-300">Resolved</div>
                                </div>
                                <div className="text-gray-500">→</div>
                                <div className="flex-1 text-center p-3 bg-purple-900/50 rounded border border-purple-600">
                                    <div className="text-2xl mb-1">💾</div>
                                    <div className="text-purple-300">Stored in Memory</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'memory' && (
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-2xl">🧠</span>
                            <h3 className="text-lg font-semibold text-white">Memory Bank</h3>
                            <span className="ml-auto bg-purple-600 px-3 py-1 rounded text-sm">
                                {memories.length} stored
                            </span>
                        </div>
                        {memories.length === 0 ? (
                            <div className="text-gray-500 text-center py-8">
                                <p>No memories stored yet.</p>
                                <p className="text-sm mt-2">Complete a ticket flow to create the first memory.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {memories.map((memory) => (
                                    <div key={memory.id} className="bg-gray-700 rounded p-4">
                                        <p className="text-sm text-gray-200">{memory.content}</p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span className="text-xs text-gray-500">
                                                {new Date(memory.createdAt).toLocaleString()}
                                            </span>
                                            <span className="text-xs text-purple-400">
                                                ID: {memory.id.slice(0, 8)}...
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'audit' && (
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-2xl">📋</span>
                            <h3 className="text-lg font-semibold text-white">Audit Trail</h3>
                            <span className="ml-auto text-sm text-gray-400">
                                Every action logged for compliance
                            </span>
                        </div>
                        {audits.length === 0 ? (
                            <div className="text-gray-500 text-center py-8">
                                <p>No audit events yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {audits.map((audit) => (
                                    <div key={audit.id} className="bg-gray-700 rounded p-3 flex items-center gap-3">
                                        <span className="text-xl">{getActionIcon(audit.action)}</span>
                                        <div className="flex-1">
                                            <div className="font-medium text-white capitalize">
                                                {formatAction(audit.action)}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                Actor: {audit.actorId || 'system'} • Ticket: {audit.ticketId?.slice(0, 8)}...
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {new Date(audit.createdAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
