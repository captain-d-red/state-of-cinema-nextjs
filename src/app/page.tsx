import { Cinema } from '@/components/cinema/Cinema';
import { catalogue } from '@/data/catalogue';

export default function Home() {
  return (
    <main>
      <Cinema />
      <section className="sr-only" aria-labelledby="index-heading">
        <h2 id="index-heading">Every film in the catalogue</h2>
        <ol>
          {catalogue.films.map((film) => (
            <li key={film.slug}>
              <h3>
                {film.title} ({film.year})
              </h3>
              <p>
                Directed by {film.director}, {film.minutes} minutes, {film.genres.join(', ')}. {film.logline}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
