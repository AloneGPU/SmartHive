import { useAppContext } from '../context/AppContext';
import { AIChatWindow } from '../components/AIChatWindow';

export const ChatPage = () => {
  const { aiConfig } = useAppContext();
  return (
    <div className="space-y-4">
      <h1 className="text-lg sm:text-xl font-bold text-gray-900">AI问答</h1>
      <AIChatWindow config={aiConfig} />
    </div>
  );
};

