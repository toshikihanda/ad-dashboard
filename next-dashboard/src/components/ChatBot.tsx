'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ProcessedRow, safeDivide, CreativeMasterItem } from '@/lib/dataProcessor';

interface ChatBotProps {
    data: ProcessedRow[];
    masterProjects: string[];
    creativeMasterData?: CreativeMasterItem[];
    articleMasterData?: Record<string, string>[];
    reportListData?: Record<string, string>[];
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export function ChatBot({ data, masterProjects, creativeMasterData, articleMasterData, reportListData }: ChatBotProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'こんにちは！広告運用ダッシュボードのAIアシスタントです。データに関する質問があれば何でも聞いてください。',
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    // Data Summarization Helper (runs only when needed)
    const getSummarizedData = () => {
        // 1. Monthly Summary by Campaign
        const monthlyMap = new Map<string, any>();
        const monthlyData: string[] = ['YearMonth,Campaign,Media,Cost,Revenue,Profit,CV,CPA,ROAS'];

        data.forEach(row => {
            const date = new Date(row.Date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const key = `${monthKey}_${row.Campaign_Name}_${row.Media}`;

            if (!monthlyMap.has(key)) {
                monthlyMap.set(key, { month: monthKey, campaign: row.Campaign_Name, media: row.Media, cost: 0, revenue: 0, profit: 0, cv: 0 });
            }
            const item = monthlyMap.get(key);
            item.cost += row.Cost;
            item.revenue += row.Revenue;
            item.profit += row.Gross_Profit;
            item.cv += row.CV;
        });

        monthlyMap.forEach(item => {
            const cpa = safeDivide(item.cost, item.cv);
            const roas = safeDivide(item.revenue, item.cost);
            monthlyData.push(`${item.month},${item.campaign},${item.media},${Math.round(item.cost)},${Math.round(item.revenue)},${Math.round(item.profit)},${item.cv},${Math.round(cpa)},${(roas * 100).toFixed(1)}%`);
        });

        // 2. Daily Summary (Last 7 Days)
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        const dailyData: string[] = ['Date,Campaign,Media,Cost,Revenue,CV,CPA'];

        data.filter(row => new Date(row.Date) >= sevenDaysAgo).forEach(row => {
            // Simply list raw rows for last 7 days might be too much if unconnected
            // Aggregate by day
        });
        // (Actually, processedRow is already daily but separated by creative. Aggregate by Day+Campaign)
        const dailyMap = new Map<string, any>();
        data.filter(row => new Date(row.Date) >= sevenDaysAgo).forEach(row => {
            const d = new Date(row.Date).toISOString().split('T')[0];
            const key = `${d}_${row.Campaign_Name}_${row.Media}`;
            if (!dailyMap.has(key)) {
                dailyMap.set(key, { date: d, campaign: row.Campaign_Name, media: row.Media, cost: 0, revenue: 0, cv: 0 });
            }
            const item = dailyMap.get(key);
            item.cost += row.Cost;
            item.revenue += row.Revenue;
            item.cv += row.CV;
        });
        dailyMap.forEach(item => {
            const cpa = safeDivide(item.cost, item.cv);
            dailyData.push(`${item.date},${item.campaign},${item.media},${Math.round(item.cost)},${Math.round(item.revenue)},${item.cv},${Math.round(cpa)}`);
        });

        // 3. Top Creatives (this month)
        const creativeMap = new Map<string, any>();
        data.filter(row => {
            const d = new Date(row.Date);
            return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
        }).forEach(row => {
            if (!row.Creative) return;
            const key = `${row.Campaign_Name}_${row.Creative}`;
            if (!creativeMap.has(key)) {
                creativeMap.set(key, { campaign: row.Campaign_Name, creative: row.Creative, cost: 0, cv: 0 });
            }
            const item = creativeMap.get(key);
            item.cost += row.Cost;
            item.cv += row.CV;
        });
        // Create lookup maps for Creative and Article Master
        const creativeDetails = new Map<string, string>();
        if (creativeMasterData) {
            creativeMasterData.forEach(item => {
                // Map by ID and Name
                if (item.creativeId) creativeDetails.set(item.creativeId, item.fileName);
                if (item.fileName) creativeDetails.set(item.fileName, item.url);
            });
        }

        const articleDetails = new Map<string, string>();
        if (articleMasterData) {
            articleMasterData.forEach(item => {
                // Assuming columns like 'Article Name', 'Content', etc.
                const name = item['記事名'] || item['Article Name'] || item['Subject'] || '';
                const content = item['文字起こし'] || item['Transcript'] || item['Content'] || '';
                if (name) articleDetails.set(name, content.substring(0, 200) + '...'); // Truncate content
            });
        }

        const topCreatives = Array.from(creativeMap.values())
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 20)
            .map(c => {
                const detail = creativeDetails.get(c.creative) || '';
                return `Creative:${c.creative} ${detail ? `(${detail})` : ''}, Camp:${c.campaign}, Cost:${c.cost}, CV:${c.cv}, CPA:${Math.round(safeDivide(c.cost, c.cv))}`;
            })
            .join('\n');

        // 4. Top Articles (Beyond only)
        const articleMap = new Map<string, any>();
        data.filter(row => {
            const d = new Date(row.Date);
            return row.Media === 'Beyond' && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
        }).forEach(row => {
            if (!row.version_name) return;
            const key = `${row.Campaign_Name}_${row.version_name}`;
            if (!articleMap.has(key)) {
                articleMap.set(key, { campaign: row.Campaign_Name, version: row.version_name, cost: 0, cv: 0 });
            }
            const item = articleMap.get(key);
            item.cost += row.Cost;
            item.cv += row.CV;
        });
        const topArticles = Array.from(articleMap.values())
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 20)
            .map(a => {
                const content = articleDetails.get(a.version) || '';
                return `Article:${a.version} ${content ? `[Content: ${content}]` : ''}, Camp:${a.campaign}, Cost:${a.cost}, CV:${a.cv}, CPA:${Math.round(safeDivide(a.cost, a.cv))}`;
            })
            .join('\n');


        return `
## 月次データ (Campaign Monthly Summary)
${monthlyData.join('\n')}

## 直近7日データ (Last 7 Days Daily)
${dailyData.join('\n')}

## 今月のトップクリエイティブ (Top 20 by Spend)
${topCreatives}

## 今月のトップ記事 (Top 20 by Spend)
${topArticles}

## 最近のレポート (Recent 5)
${(reportListData || []).slice(-5).map(r => `Date:${r.Date || r.CreatedAt || ''}, Campaign:${r.Campaign || r.Project || ''}, URL:${r.URL || r.Link || ''}`).join('\n')}
        `;
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Prepare context
            const contextData = getSummarizedData();

            const historyForApi = messages
                .filter(m => m.role !== 'assistant' || m.id !== 'welcome')
                .map(m => ({ role: m.role, content: m.content }));

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg.content,
                    dataContext: contextData,
                    history: historyForApi,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // Handle API error response
                throw new Error(data.error || 'API request failed');
            }

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.reply || 'すみません、回答できませんでした。',
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, botMsg]);

        } catch (error: any) {
            console.error('ChatBot Error:', error);
            const errorMsg = error.message || 'エラーが発生しました。もう一度お試しください。';
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `申し訳ありません、エラーが発生しました。\n詳細: ${errorMsg}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110 flex items-center justify-center group"
                    title="AIアシスタントとチャット"
                >
                    <span className="text-2xl">💬</span>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-50 w-[350px] md:w-[400px] h-[75vh] min-h-[420px] max-h-[820px] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-200 animate-in slide-in-from-bottom-10 fade-in duration-300">
                    {/* Header（薄くして表示エリアを広く） */}
                    <div className="flex items-center justify-between py-2 px-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-t-2xl text-white shrink-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-base">🤖</span>
                            <span className="font-bold text-sm">AIアシスタント</span>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-white/20 rounded-full transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Messages Area（縦幅を広く確保） */}
                    <div
                        ref={scrollRef}
                        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-gray-50"
                    >
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-none'
                                        }`}
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            // Customize list styling to be more compact
                                            ul: (props) => <ul className="list-disc pl-4 space-y-1 my-1" {...props} />,
                                            ol: (props) => <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />,
                                            li: (props) => <li className="leading-snug" {...props} />,
                                            // Bold text
                                            strong: (props) => <span className="font-bold text-blue-700" {...props} />,
                                            // Headers
                                            h3: (props) => <h3 className="font-bold mt-2 mb-1 text-gray-900 border-b border-gray-200 pb-1" {...props} />,
                                            // Paragraphs
                                            p: (props) => <p className="mb-1 last:mb-0" {...props} />,
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 flex gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-gray-100 rounded-b-2xl">
                        <div className="flex gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="質問を入力... (Ctrl+Enterで送信)"
                                className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none min-h-[40px] max-h-[150px]"
                                disabled={isLoading}
                                rows={1}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                ➤
                            </button>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2 text-center">
                            AIは間違いを犯す可能性があります。重要な判断はデータを確認してください。
                        </div>
                    </div>
                </div>
            )}

            {/* Click outside to close (Optional, might be annoying if accidental) */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    );
}
