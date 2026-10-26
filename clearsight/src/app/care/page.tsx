import { StepFrame } from "@/components/ui";
import { EyeCareFinder } from "@/components/EyeCareFinder";

export default function CarePage() {
  return (
    <StepFrame title="Eye-care finder">
      <div className="max-w-xl text-center">
        <h2 className="text-3xl font-light">
          Find an <b className="font-semibold">eye professional</b> near you.
        </h2>
        <p className="mt-3 text-muted">Optometrists for exams and glasses, and ophthalmologists for medical eye care.</p>
      </div>
      <EyeCareFinder />
    </StepFrame>
  );
}
