import SwiftUI
import RoomPlan
import UIKit

/// Skanneskjermen fra RoomPlan, pakket inn for SwiftUI.
struct SkannView: UIViewControllerRepresentable {
    var ferdig: (CapturedRoom?) -> Void

    func makeUIViewController(context: Context) -> SkannKontroller { SkannKontroller(ferdig: ferdig) }
    func updateUIViewController(_ vc: SkannKontroller, context: Context) {}
}

final class SkannKontroller: UIViewController, RoomCaptureViewDelegate {
    private var captureView: RoomCaptureView!
    private let ferdig: (CapturedRoom?) -> Void
    private var resultat: CapturedRoom?
    private var avsluttet = false
    private let hovedknapp = UIButton(configuration: .filled())
    private let avbrytknapp = UIButton(configuration: .gray())

    init(ferdig: @escaping (CapturedRoom?) -> Void) {
        self.ferdig = ferdig
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) brukes ikke") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        captureView = RoomCaptureView(frame: view.bounds)
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        captureView.delegate = self
        view.addSubview(captureView)

        var hoved = UIButton.Configuration.filled()
        hoved.title = "Ferdig med rommet"
        hoved.cornerStyle = .capsule
        hoved.buttonSize = .large
        hoved.baseBackgroundColor = UIColor(red: 0.73, green: 0.28, blue: 0.16, alpha: 1)
        hovedknapp.configuration = hoved
        hovedknapp.addAction(UIAction { [weak self] _ in self?.trykkHoved() }, for: .touchUpInside)

        var avbryt = UIButton.Configuration.gray()
        avbryt.title = "Avbryt"
        avbryt.cornerStyle = .capsule
        avbryt.buttonSize = .large
        avbrytknapp.configuration = avbryt
        avbrytknapp.addAction(UIAction { [weak self] _ in self?.avbryt() }, for: .touchUpInside)

        let rad = UIStackView(arrangedSubviews: [avbrytknapp, hovedknapp])
        rad.axis = .horizontal
        rad.spacing = 12
        rad.distribution = .fillProportionally
        rad.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rad)
        NSLayoutConstraint.activate([
            rad.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            rad.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            rad.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if resultat == nil { captureView.captureSession.stop() }
    }

    private func trykkHoved() {
        if let resultat {
            // Andre trykk: brukeren har sett modellen og vil beholde den.
            avsluttet = true
            ferdig(resultat)
        } else {
            // Første trykk: stopp skanningen. RoomPlan bearbeider og viser 3D-modellen.
            hovedknapp.configuration?.title = "Bearbeider …"
            hovedknapp.isEnabled = false
            captureView.captureSession.stop()
        }
    }

    private func avbryt() {
        guard !avsluttet else { return }
        avsluttet = true
        captureView.captureSession.stop()
        ferdig(nil)
    }

    // MARK: RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !avsluttet else { return }
        if error != nil {
            hovedknapp.configuration?.title = "Skanningen feilet"
            hovedknapp.isEnabled = false
            return
        }
        resultat = processedResult
        hovedknapp.configuration?.title = "Bruk skanningen"
        hovedknapp.isEnabled = true
    }
}
