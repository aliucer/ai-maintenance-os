'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
    { name: 'Resident', href: '/', description: 'Submit Issue' },
    { name: 'Manager', href: '/manager', description: 'Operations' },
    { name: 'AI Insights', href: '/insights', description: 'Memory & Stats' },
];

export default function Header() {
    const pathname = usePathname();

    return (
        <header className="bg-gray-800 border-b border-gray-700">
            <div className="px-6 py-4">
                <h1 className="text-2xl font-bold text-white">PropOps AI</h1>
                <p className="text-gray-400 text-sm">Property Maintenance Triage System</p>
            </div>
            <nav className="flex border-t border-gray-700">
                {tabs.map((tab) => {
                    const isActive = pathname === tab.href;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={`flex-1 px-6 py-3 text-center transition-colors ${isActive
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            <span className="font-medium">{tab.name}</span>
                            <span className="block text-xs opacity-75">{tab.description}</span>
                        </Link>
                    );
                })}
            </nav>
        </header>
    );
}
