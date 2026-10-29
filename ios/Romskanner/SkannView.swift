import SwiftUI
import RoomPlan
import UIKit

/// Skanneskjermen fra RoomPlan, pakket inn for SwiftUI.
/// Med `etasje` skannes flere rom etter hverandre i samme økt: hvert rom sendes til `nyttRom`
/// når brukeren går videre, og alle rommene får samme koordinater, så de kan vises som én etasje.
struct SkannView: UIViewControllerRepresentable {
    var etasje = false
    var nyttRom: ((CapturedRoom, [Fotobilde]) -> Void)? = nil
    var ferdig: (CapturedRoom?, [Fotobilde]) -> Void

    func makeUIViewController(context: Context) -> SkannKontroller { SkannKontroller(etasje: etasje, nyttRom: nyttRom, ferdig: ferdig) }
    func updateUIViewController(_ vc: SkannKontroller, context: Context) {}
}

final class SkannKontroller: UIViewController, RoomCaptureViewDelegate {
    private var captureView: RoomCaptureView!
    private let etasje: Bool
    private let nyttRom: ((CapturedRoom, [Fotobilde]) -> Void)?
    private let ferdig: (CapturedRoom?, [Fotobilde]) -> Void
    private var resultat: CapturedRoom?
    private var samler = Bildesamler()
    private var bildeTimer: Timer?
    private var avsluttet = false
    private var skanner = false
    private var lagret = 0 // rom lagret i denne etasjeskanningen
    private var feilet = false
    private let hovedknapp = UIButton(configuration: .filled())
    private let avbrytknapp = UIButton(configuration: .gray())
    private let tellerEtikett = UILabel()

    init(etasje: Bool, nyttRom: ((CapturedRoom, [Fotobilde]) -> Void)?, ferdig: @escaping (CapturedRoom?, [Fotobilde]) -> Void) {
        self.etasje = etasje
        self.nyttRom = nyttRom
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

        // Etasje: hvor mange rom som er lagret, øverst på skjermen
        if etasje {
            tellerEtikett.font = .preferredFont(forTextStyle: .headline)
            tellerEtikett.textColor = .white
            tellerEtikett.backgroundColor = UIColor.black.withAlphaComponent(0.55)
            tellerEtikett.layer.cornerRadius = 14
            tellerEtikett.layer.masksToBounds = true
            tellerEtikett.textAlignment = .center
            tellerEtikett.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(tellerEtikett)
            NSLayoutConstraint.activate([
                tellerEtikett.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
                tellerEtikett.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                tellerEtikett.heightAnchor.constraint(equalToConstant: 30),
                tellerEtikett.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),
            ])
            oppdaterTeller()
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        start()
    }

    /// Starter (eller fortsetter) skanningen. I en etasjeskanning fortsetter samme AR-økt, så
    /// neste rom havner riktig i forhold til de forrige.
    private func start() {
        skanner = true
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        // Bilder til 3D-modellen med bilder: ett når kameraet har flyttet seg nok.
        bildeTimer?.invalidate()
        bildeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self, let frame = self.captureView.captureSession.arSession.currentFrame else { return }
            self.samler.vurder(frame)
        }
    }

    private func stoppBilder() {
        bildeTimer?.invalidate()
        bildeTimer = nil
    }

    private func oppdaterTeller() {
        tellerEtikett.text = lagret == 0 ? "  Rom 1  " : "  \(lagret) rom lagret · rom \(lagret + 1)  "
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stoppBilder()
        if skanner { captureView.captureSession.stop() }
    }

    private func trykkHoved() {
        if feilet {
            // Etasje: bearbeidingen feilet, skann samme rom på nytt
            feilet = false
            samler = Bildesamler()
            hovedknapp.configuration?.title = "Ferdig med rommet"
            start()
            return
        }
        if let resultat {
            if etasje {
                // «Neste rom»: lagre dette rommet og fortsett skanningen i samme økt
                nyttRom?(resultat, samler.bilder)
                lagret += 1
                self.resultat = nil
                samler = Bildesamler()
                hovedknapp.configuration?.title = "Ferdig med rommet"
                avbrytknapp.configuration?.title = "Ferdig"
                oppdaterTeller()
                start()
            } else {
                // Andre trykk: brukeren har sett modellen og vil beholde den.
                avsluttet = true
                ferdig(resultat, samler.bilder)
            }
        } else {
            // Første trykk: stopp skanningen. RoomPlan bearbeider og viser 3D-modellen.
            // I en etasje holdes AR-økten i gang, så neste rom får samme koordinater.
            hovedknapp.configuration?.title = "Bearbeider …"
            hovedknapp.isEnabled = false
            stoppBilder()
            skanner = false
            if etasje { captureView.captureSession.stop(pauseARSession: false) } else { captureView.captureSession.stop() }
        }
    }

    /// Avbryt, eller i en etasje: «Ferdig». Et ferdig bearbeidet rom lagres først; et rom som
    /// fortsatt skannes, forkastes.
    private func avbryt() {
        guard !avsluttet else { return }
        avsluttet = true
        stoppBilder()
        if skanner { captureView.captureSession.stop() }
        skanner = false
        if etasje, let resultat { nyttRom?(resultat, samler.bilder) }
        ferdig(nil, [])
    }

    // MARK: RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !avsluttet else { return }
        if error != nil {
            feilet = etasje
            hovedknapp.configuration?.title = etasje ? "Skann rommet på nytt" : "Skanningen feilet"
            hovedknapp.isEnabled = etasje
            return
        }
        resultat = processedResult
        hovedknapp.configuration?.title = etasje ? "Neste rom" : "Bruk skanningen"
        hovedknapp.isEnabled = true
        if etasje { avbrytknapp.configuration?.title = "Ferdig" }
    }
}
