import '../styles/global.css';
interface Props {
    getToken: () => Promise<string>;
}
export default function ItemList({ getToken }: Props): import("react").JSX.Element;
export {};
